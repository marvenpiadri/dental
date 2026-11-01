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

const VERT = `varying vec3 vP; varying vec3 vN; void main(){ vP = position; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
// Zone comes from the local position: top cap = occlusal, otherwise the dominant horizontal axis. Each zone's code drives the look.
const FRAG = `uniform float uCode[5]; uniform float uSev[5]; uniform float uMesial; uniform float uTop; varying vec3 vP; varying vec3 vN;
float pick(float a[5], int i){ if(i==0) return a[0]; if(i==1) return a[1]; if(i==2) return a[2]; if(i==3) return a[3]; return a[4]; }
void main(){
  int z = 4; vec3 p = vP;
  if (p.y < uTop * 0.45) { z = abs(p.x) > abs(p.z) ? (p.x * uMesial > 0.0 ? 0 : 1) : (p.z > 0.0 ? 2 : 3); }
  float code = pick(uCode, z); float sev = pick(uSev, z);
  vec3 col = vec3(0.93, 0.91, 0.86); float spec = 0.25; float shin = 24.0;
  float n = fract(sin(dot(floor(p.xz * 18.0), vec2(12.9898, 78.233))) * 43758.5453);
  if (code == 1.0) { col = mix(col, vec3(0.16, 0.08, 0.04), 0.55 + 0.4 * sev / 6.0 - 0.15 * n); spec = 0.05; }
  if (code == 2.0) { col = vec3(0.55, 0.57, 0.6); spec = 1.0; shin = 90.0; }
  if (code == 3.0) { col = vec3(0.96, 0.94, 0.86); spec = 0.1; shin = 8.0; }
  if (code == 4.0) { col = vec3(0.85, 0.7, 0.3); spec = 0.8; shin = 60.0; }
  vec3 N = normalize(vN); vec3 L = normalize(vec3(0.4, 0.8, 0.6)); vec3 V = vec3(0.0, 0.0, 1.0);
  float d = max(dot(N, L), 0.0) * 0.75 + 0.3; float s = pow(max(dot(reflect(-L, N), V), 0.0), shin) * spec;
  gl_FragColor = vec4(col * d + vec3(s), 1.0);
}`;

/** Placeholder 3D tooth: procedural shapes until real meshes are exported; the shader and scene wiring stay the same. */
@Component({
  selector: 'den-tooth-3d',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #host class="host" role="img" aria-label="3D tooth"></div>`,
  styles: `:host { display: block; } .host { width: 100%; height: 100%; min-height: 280px; touch-action: none; }`,
})
export class Tooth3dComponent implements OnDestroy {
  readonly no = input.required<number>();
  readonly state = input.required<ToothRecord>();
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private ctx: { render: () => void; dispose: () => void; apply: (t: ToothRecord, no: number) => void } | null = null;
  private starting = false;

  constructor() {
    effect(() => {
      const t = this.state(), no = this.no();
      if (!this.browser) return;
      if (this.ctx) { this.ctx.apply(t, no); return; }
      if (!this.starting) { this.starting = true; void this.start().then(() => this.ctx?.apply(this.state(), this.no())); }
    });
  }

  ngOnDestroy(): void { this.ctx?.dispose(); this.ctx = null; }

  private async start(): Promise<void> {
    const [T, { OrbitControls }] = await Promise.all([import('three') as Promise<Three>, import('three/examples/jsm/controls/OrbitControls.js')]);
    const el = this.host().nativeElement;
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(3.2, 2.4, 4.2);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false; controls.target.set(0, 0, 0);

    // One group per tooth; the hit-box lives on the group, meshes inside swap by presence.
    const group = new T.Group();
    scene.add(group);
    const uniforms = { uCode: { value: [0, 0, 0, 0, 0] }, uSev: { value: [0, 0, 0, 0, 0] }, uMesial: { value: 1 }, uTop: { value: 0.8 } };
    const mat = new T.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG });
    const crown = new T.Mesh(new T.SphereGeometry(1, 40, 28), mat);
    crown.position.y = 0.8;
    const roots = new T.Group();
    const rootMat = new T.MeshStandardMaterial({ color: 0xd9c8a0, roughness: 0.8 });
    const hardware = new T.Group();
    const steel = new T.MeshStandardMaterial({ color: 0x9aa4ae, metalness: 0.9, roughness: 0.25 });
    const screw = new T.Mesh(new T.CylinderGeometry(0.28, 0.2, 1.8, 24), steel); screw.position.y = -1.1;
    const abut = new T.Mesh(new T.CylinderGeometry(0.22, 0.28, 0.35, 24), steel); abut.position.y = -0.1;
    hardware.add(screw, abut);
    const socket = new T.Mesh(new T.TorusGeometry(0.6, 0.05, 8, 32), new T.MeshBasicMaterial({ color: 0x888888 }));
    socket.rotation.x = Math.PI / 2;
    scene.add(new T.AmbientLight(0xffffff, 0.8), new T.DirectionalLight(0xffffff, 1.5));
    group.add(crown, roots, hardware, socket);

    const render = () => renderer.render(scene, camera);
    controls.addEventListener('change', render);
    const resize = () => { const w = el.clientWidth || 300, h = el.clientHeight || 300; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); render(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();

    const apply = (t: ToothRecord, no: number) => {
      const sel = String((t as { toothSelection?: string }).toothSelection ?? '');
      const gone = sel.includes('no-tooth'), implant = sel === 'implant';
      const q = Math.floor(no / 10) % 10, n = no % 10;
      const upper = q === 1 || q === 2 || q === 5 || q === 6;
      const molar = n >= 6, front = n <= 3;
      uniforms.uMesial.value = q === 1 || q === 4 || q === 5 || q === 8 ? -1 : 1; // mesial is toward the chart midline
      uniforms.uCode.value = ZONES.map((z) => CODE(t, z));
      uniforms.uSev.value = ZONES.map((z) => t.cariesSeverity.get(z) ?? 0);
      crown.scale.set(front ? 0.7 : 1, 0.8, front ? 0.55 : 0.9);
      uniforms.uTop.value = 0.8;
      roots.clear();
      const count = molar ? (upper ? 3 : 2) : 1;
      for (let i = 0; i < count; i++) {
        const r = new T.Mesh(new T.ConeGeometry(molar ? 0.3 : 0.35, 1.8, 16), rootMat);
        r.rotation.x = Math.PI; r.position.set(count === 1 ? 0 : (i - (count - 1) / 2) * 0.55, -0.7, 0);
        roots.add(r);
      }
      group.scale.y = upper ? -1 : 1; // roots point away from the bite: up for the upper arch
      crown.visible = !gone && !implant ? true : implant;
      roots.visible = !gone && !implant;
      hardware.visible = implant;
      socket.visible = gone;
      render();
    };
    this.ctx = { render, apply, dispose: () => { ro.disconnect(); controls.dispose(); renderer.dispose(); renderer.domElement.remove(); } };
  }
}
