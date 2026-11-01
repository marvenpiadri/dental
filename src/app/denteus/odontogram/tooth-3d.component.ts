import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, PLATFORM_ID, effect, inject, input, viewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { ToothRecord } from './engine/chart';

type Three = typeof import('three');
const ZONES = ['mesial', 'distal', 'buccal', 'lingual', 'occlusal'] as const;
// 0 clean, 1 caries, 2 amalgam, 3 composite, 4 other restoration
const CODE = (t: ToothRecord, z: string): number => {
  if (t.fillingSurfaces.has(z)) { const m = String(t.fillingSurfaceMaterials.get(z) ?? t.fillingMaterial); return m.includes('amalgam') ? 2 : m.includes('composite') ? 3 : 4; }
  return t.caries.has('caries-' + z) ? 1 : 0;
};

interface Part { id: string; group: 'tooth' | 'pulp'; fdi: number; positions: number; normals: number; indices: number; vertexCount: number; indexCount: number; axes?: { center: number[]; side: number[]; up: number[]; out: number[] } }
interface TfData { buf: ArrayBuffer; parts: Part[] }
let tfData: Promise<TfData> | null = null;
/** The ToothFairy3 manifest and mesh buffer (about 8 MB), fetched once and shared by every overlay. */
const loadTf = (): Promise<TfData> => (tfData ??= Promise.all([fetch('/models/toothfairy/manifest.json').then((r) => r.json()), fetch('/models/toothfairy/toothfairy.bin').then((r) => r.arrayBuffer())])
  .then(([m, buf]) => ({ buf, parts: m.parts as Part[] }))
  .catch((e) => { tfData = null; throw e; }));

const VERT = `varying vec3 vP; varying vec3 vN; void main(){ vP = position; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
// Zone comes from the local position: top cap = occlusal, otherwise the dominant horizontal axis. Each zone's code drives the look.
const FRAG = `uniform float uCode[5]; uniform float uSev[5]; uniform float uMesial; uniform float uTop; uniform float uCrown; uniform float uAlpha; varying vec3 vP; varying vec3 vN;
float pick(float a[5], int i){ if(i==0) return a[0]; if(i==1) return a[1]; if(i==2) return a[2]; if(i==3) return a[3]; return a[4]; }
void main(){
  vec3 p = vP; float depth = uTop - p.y; // distance down from the biting edge
  vec3 enamel = vec3(0.93, 0.91, 0.85), root = vec3(0.85, 0.77, 0.62);
  vec3 col = mix(enamel, root, smoothstep(uCrown * 0.95, uCrown * 1.12, depth));
  float spec = 0.25; float shin = 24.0;
  if (depth < uCrown) {
    int z = depth < uCrown * 0.3 ? 4 : (abs(p.x) > abs(p.z) ? (p.x * uMesial > 0.0 ? 0 : 1) : (p.z > 0.0 ? 2 : 3));
    float code = pick(uCode, z); float sev = pick(uSev, z);
    float n = fract(sin(dot(floor(p.xz * 6.0), vec2(12.9898, 78.233))) * 43758.5453);
    if (code == 1.0) { col = mix(col, vec3(0.16, 0.08, 0.04), 0.55 + 0.4 * sev / 6.0 - 0.15 * n); spec = 0.05; }
    if (code == 2.0) { col = vec3(0.55, 0.57, 0.6); spec = 1.0; shin = 90.0; }
    if (code == 3.0) { col = vec3(0.96, 0.94, 0.86); spec = 0.1; shin = 8.0; }
    if (code == 4.0) { col = vec3(0.85, 0.7, 0.3); spec = 0.8; shin = 60.0; }
  }
  vec3 N = normalize(vN); vec3 L = normalize(vec3(0.4, 0.8, 0.6)); vec3 V = vec3(0.0, 0.0, 1.0);
  float d = abs(dot(N, L)) * 0.7 + 0.35; float s = pow(max(dot(reflect(-L, N), V), 0.0), shin) * spec;
  gl_FragColor = vec4(col * d + vec3(s), uAlpha);
}`;

/** One tooth from the ToothFairy3 scan (case F_026), stood on its own long axis. Surfaces are painted by shader from the chart record. */
@Component({
  selector: 'den-tooth-3d',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #host class="host" role="img" aria-label="3D tooth"></div>`,
  styles: `:host { display: block; position: relative; } .host { width: 100%; height: 100%; min-height: 280px; touch-action: none; }`,
})
export class Tooth3dComponent implements OnDestroy {
  readonly no = input.required<number>();
  readonly state = input.required<ToothRecord>();
  /** Show the pulp chamber and canals through the tooth. */
  readonly showPulp = input(false);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private ctx: { apply: (t: ToothRecord, no: number, pulp: boolean) => void; dispose: () => void } | null = null;
  private starting = false;

  constructor() {
    effect(() => {
      const t = this.state(), no = this.no(), pulp = this.showPulp();
      if (!this.browser) return;
      if (this.ctx) { this.ctx.apply(t, no, pulp); return; }
      if (!this.starting) { this.starting = true; void this.start().then(() => this.ctx?.apply(this.state(), this.no(), this.showPulp())); }
    });
  }

  ngOnDestroy(): void { this.ctx?.dispose(); this.ctx = null; }

  private async start(): Promise<void> {
    const [T, { OrbitControls }, data] = await Promise.all([import('three') as Promise<Three>, import('three/examples/jsm/controls/OrbitControls.js'), loadTf()]);
    const el = this.host().nativeElement;
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(2.5, 1, 7.5);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    const render = () => renderer.render(scene, camera);
    controls.addEventListener('change', render);

    // Frame maths: each tooth's own axes (measured from the scan) become a right-handed local frame with the crown on +y.
    const V = (a: number[]) => new T.Vector3(a[0], a[1], a[2]);
    const teeth = new Map(data.parts.filter((p) => p.group === 'tooth' && p.axes).map((p) => [p.fdi, p]));
    const upperC = new T.Vector3(), lowerC = new T.Vector3(); let nu = 0, nl = 0;
    for (const [f, p] of teeth) { const c = V(p.axes!.center); if (f < 30) { upperC.add(c); nu++; } else { lowerC.add(c); nl++; } }
    const toLower = lowerC.divideScalar(nl).sub(upperC.divideScalar(nu)).normalize(); // points from the upper jaw to the lower one
    const midline = teeth.has(11) && teeth.has(21) ? V(teeth.get(11)!.axes!.center).add(V(teeth.get(21)!.axes!.center)).multiplyScalar(0.5) : new T.Vector3();
    const frameOf = (fdi: number) => {
      const a = teeth.get(fdi)!.axes!, c = V(a.center);
      const crown = fdi < 30 ? toLower.clone() : toLower.clone().negate();
      const y = V(a.up); if (y.dot(crown) < 0) y.negate(); y.normalize();
      const z = V(a.out); z.sub(y.clone().multiplyScalar(z.dot(y))).normalize();
      const x = new T.Vector3().crossVectors(y, z); // proper rotation: never a mirror
      return { c, x, y, z, mesial: Math.sign(midline.clone().sub(c).dot(x)) || 1 };
    };
    const cache = new Map<string, import('three').BufferGeometry>();
    let scale = 1, yMin = 0, yMax = 0;
    const geometry = (fdi: number, kind: 'tooth' | 'pulp') => {
      const key = kind + fdi;
      const hit = cache.get(key); if (hit) return hit;
      const part = data.parts.find((p) => p.fdi === fdi && p.group === kind);
      if (!part || !teeth.has(fdi)) return null;
      const f = frameOf(fdi);
      const pos = new Float32Array(data.buf, part.positions, part.vertexCount * 3), nrm = new Float32Array(data.buf, part.normals, part.vertexCount * 3);
      const outP = new Float32Array(pos.length), outN = new Float32Array(pos.length);
      const v = new T.Vector3();
      for (let i = 0; i < part.vertexCount; i++) {
        v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).sub(f.c);
        outP.set([v.dot(f.x), v.dot(f.y), v.dot(f.z)], i * 3);
        v.set(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]);
        outN.set([v.dot(f.x), v.dot(f.y), v.dot(f.z)], i * 3);
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(outP, 3)); g.setAttribute('normal', new T.BufferAttribute(outN, 3));
      g.setIndex(new T.BufferAttribute(new Uint32Array(data.buf, part.indices, part.indexCount).slice(), 1));
      cache.set(key, g);
      return g;
    };

    const uniforms = { uCode: { value: [0, 0, 0, 0, 0] }, uSev: { value: [0, 0, 0, 0, 0] }, uMesial: { value: 1 }, uTop: { value: 1 }, uCrown: { value: 1 }, uAlpha: { value: 1 } };
    const mat = new T.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true });
    const pulpMat = new T.MeshStandardMaterial({ color: 0xd9626b, roughness: 0.5, transparent: true, opacity: 0.9 });
    const tooth = new T.Mesh(undefined, mat), pulp = new T.Mesh(undefined, pulpMat);
    const hardware = new T.Group();
    const steel = new T.MeshStandardMaterial({ color: 0x9aa4ae, metalness: 0.9, roughness: 0.25 });
    const screw = new T.Mesh(new T.CylinderGeometry(0.3, 0.2, 1.9, 24), steel); screw.position.y = -1.3;
    const abut = new T.Mesh(new T.CylinderGeometry(0.22, 0.3, 0.4, 24), steel); abut.position.y = -0.1;
    hardware.add(screw, abut);
    const socket = new T.Mesh(new T.TorusGeometry(0.7, 0.05, 8, 32), new T.MeshBasicMaterial({ color: 0x888888 }));
    socket.rotation.x = Math.PI / 2;
    const group = new T.Group(); // the invisible container: pose and visibility live here, the meshes inside only swap
    group.add(tooth, pulp, hardware, socket);
    scene.add(group, new T.AmbientLight(0xffffff, 0.8), new T.DirectionalLight(0xffffff, 1.5));

    const resize = () => { const w = el.clientWidth || 300, h = el.clientHeight || 300; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); render(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();

    let shownFdi = 0;
    const apply = (t: ToothRecord, no: number, showPulp: boolean) => {
      const sel = String((t as { toothSelection?: string }).toothSelection ?? '');
      const gone = sel.includes('no-tooth'), implant = sel === 'implant';
      if (no !== shownFdi) {
        const g = geometry(no, 'tooth');
        if (g) {
          g.computeBoundingBox();
          const b = g.boundingBox!; yMin = b.min.y; yMax = b.max.y; scale = 4 / (yMax - yMin);
          tooth.geometry = g; pulp.geometry = geometry(no, 'pulp') ?? new T.BufferGeometry();
          group.scale.setScalar(scale);
          const mid = (yMin + yMax) / 2;
          tooth.position.y = pulp.position.y = -mid; // centre the tooth on the origin
          uniforms.uTop.value = yMax; uniforms.uCrown.value = (yMax - yMin) * 0.36;
          uniforms.uMesial.value = frameOf(no).mesial;
          controls.target.set(0, 0, 0); camera.position.set(2.5, 1, 7.5).setLength(9); controls.update();
        }
        group.rotation.z = no < 30 ? Math.PI : 0; // roots up for the upper arch
        shownFdi = no;
      }
      uniforms.uCode.value = ZONES.map((z) => CODE(t, z));
      uniforms.uSev.value = ZONES.map((z) => t.cariesSeverity.get(z) ?? 0);
      uniforms.uAlpha.value = showPulp ? 0.35 : 1; mat.depthWrite = !showPulp; pulp.renderOrder = 1;
      tooth.visible = !gone && !implant;
      pulp.visible = tooth.visible && showPulp;
      hardware.visible = implant;
      hardware.scale.setScalar(1 / scale * 1);
      socket.visible = gone;
      render();
    };
    this.ctx = { apply, dispose: () => { ro.disconnect(); controls.dispose(); renderer.dispose(); renderer.domElement.remove(); for (const g of cache.values()) g.dispose(); } };
  }
}
