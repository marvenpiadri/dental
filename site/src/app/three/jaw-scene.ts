import type * as T from 'three';

export type ToothState = 'caries' | 'filling' | 'crown' | 'implant' | 'rootcanal' | 'missing';
/** An invented chart, used only to show what the engine does. Not a patient. */
export const DEMO_CHART: Record<number, ToothState> = { 12: 'caries', 13: 'filling', 21: 'crown', 22: 'caries', 24: 'filling', 43: 'caries', 36: 'implant', 46: 'rootcanal', 47: 'missing' };
const PLAN = [12, 22, 46];
const STATE_CODE: Record<ToothState, number> = { caries: 1, filling: 2, crown: 3, implant: 4, rootcanal: 5, missing: 6 };
export const STATE_DOT: Record<ToothState, string> = { caries: '#6b3f26', filling: '#c9ced4', crown: '#e3b04b', implant: '#00e5ff', rootcanal: '#ff6a3d', missing: '#6d6d75' };

interface Part { id: string; group: 'tooth' | 'bone' | 'pulp'; fdi: number | null; n: number; tris: number; big: boolean; lo: number[]; hi: number[]; pos: number; nor: number; idx: number }
let data: Promise<{ parts: Part[]; buf: ArrayBuffer }> | null = null;
const load = () => (data ??= Promise.all([fetch('models/jaw.json').then((r) => r.json()), fetch('models/jaw.bin').then((r) => r.arrayBuffer())]).then(([m, buf]) => ({ parts: m.parts as Part[], buf })).catch((e) => { data = null; throw e; }));

export interface Options {
  canvas: HTMLCanvasElement; layer: HTMLElement; names: Record<ToothState, string>; tooth: string; reduced: boolean;
}
/** Camera for each story step: horizontal angle, elevation, distance, and which jaws are shown (1 = upper, 2 = lower, 3 = both). */
const VIEW = [
  { az: 0.55, el: 0.32, d: 235, jaws: 3, x: 0, y: 0 },    // 0 scan: both jaws as an x-ray
  { az: 0.0, el: 1.12, d: 175, jaws: 2, x: 0, y: 0 },     // 1 know: lower arch from above, every tooth named
  { az: -0.35, el: 0.22, d: 215, jaws: 3, x: 0, y: 0 },   // 2 record: the charted mouth
  { az: 0.0, el: 0.08, d: 245, jaws: 3, x: 0, y: 0 },     // 3 plan
];

const NOISE = `float h3(vec3 q){return fract(sin(dot(q,vec3(12.9898,78.233,37.719)))*43758.5453);}
float vn(vec3 q){vec3 i=floor(q),f=fract(q);f=f*f*(3.-2.*f);return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}`;

export class JawScene {
  private readonly three: typeof T;
  private renderer!: T.WebGLRenderer; private scene!: T.Scene; private camera!: T.PerspectiveCamera;
  private spin!: T.Group; private raycaster!: T.Raycaster;
  private teeth = new Map<number, { mesh: T.Mesh; u: Record<string, T.IUniform>; center: T.Vector3; ghost: T.Mesh; pulp?: T.Mesh }>();
  private ghostU: { uA: T.IUniform; uTime: T.IUniform }[] = [];
  private boneU: T.IUniform[] = []; private implant?: T.Mesh;
  private jawU = { up: { value: 1 }, low: { value: 1 } };
  private cur = { az: 0.55, el: 0.32, d: 235, up: 1, low: 1, scan: 1, show: 0, solid: 0, dim: 0, labels: 0 };
  private tgt = { ...this.cur };
  private step = 0; private hero = false; private userAz = 0; private vel = 0; private dragging = false; private lastX = 0;
  private raf = 0; private last = 0; private t = 0; private running = false; private visible = true;
  private tags = new Map<number, HTMLElement>(); private tip!: HTMLElement; private hover: number | null = null; private center!: T.Vector3;
  private cleanup: (() => void)[] = [];

  static async create(o: Options): Promise<JawScene> {
    const [three, env, d] = await Promise.all([import('three'), import('three/examples/jsm/environments/RoomEnvironment.js'), load()]);
    const s = new JawScene(three, o); s.build(env.RoomEnvironment, d); return s;
  }
  private constructor(three: typeof T, private o: Options) { this.three = three; this.center = new three.Vector3(); }

  private build(RoomEnvironment: new () => T.Scene, d: { parts: Part[]; buf: ArrayBuffer }): void {
    const T3 = this.three, o = this.o;
    this.renderer = new T3.WebGLRenderer({ canvas: o.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); this.renderer.toneMapping = T3.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 0.82; this.renderer.setClearColor(0x000000, 0);
    this.scene = new T3.Scene();
    const pm = new T3.PMREMGenerator(this.renderer); this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
    this.scene.environmentIntensity = 0.75; const key = new T3.DirectionalLight(0xffffff, 1.7); key.position.set(120, 180, 160); this.scene.add(key);
    const rim = new T3.DirectionalLight(0x6fe8ff, 1.6); rim.position.set(-160, 60, -140); this.scene.add(rim);
    this.camera = new T3.PerspectiveCamera(28, 1, 10, 1200); this.raycaster = new T3.Raycaster();
    this.spin = new T3.Group(); this.scene.add(this.spin);
    const z = new T3.Group(); z.rotation.x = -Math.PI / 2; this.spin.add(z); // the scan is Z-up
    const inner = new T3.Group(); z.add(inner);

    const geoOf = (p: Part): T.BufferGeometry => {
      const q = new Int16Array(d.buf, p.pos, p.n * 3), nq = new Int8Array(d.buf, p.nor, p.n * 4);
      const pos = new Float32Array(p.n * 3), nor = new Float32Array(p.n * 3);
      for (let i = 0; i < p.n; i++) for (let k = 0; k < 3; k++) { pos[i * 3 + k] = p.lo[k] + ((q[i * 3 + k] + 32767) / 65534) * (p.hi[k] - p.lo[k]); nor[i * 3 + k] = nq[i * 4 + k] / 127; }
      const g = new T3.BufferGeometry(); g.setAttribute('position', new T3.BufferAttribute(pos, 3)); g.setAttribute('normal', new T3.BufferAttribute(nor, 3));
      g.setIndex(new T3.BufferAttribute(p.big ? new Uint32Array(d.buf, p.idx, p.tris * 3) : new Uint16Array(d.buf, p.idx, p.tris * 3), 1)); g.computeBoundingBox(); return g;
    };
    const ghost = (g: T.BufferGeometry, color: number, jaw: 'up' | 'low' | null, alpha = 1, bone = false): T.Mesh => {
      const uA = { value: alpha }, uTime = { value: 0 };
      const m = new T3.ShaderMaterial({
        transparent: true, depthWrite: false, blending: T3.AdditiveBlending, uniforms: { uA, uTime, uC: { value: new T3.Color(color) }, uJ: jaw ? this.jawU[jaw] : { value: 1 } },
        vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vO; void main(){ vO = position; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
        fragmentShader: `varying vec3 vN; varying vec3 vV; varying vec3 vO; uniform vec3 uC; uniform float uA; uniform float uTime; uniform float uJ;
          void main(){ float f = pow(1. - abs(dot(normalize(vN), normalize(vV))), 2.2); float band = exp(-pow((mod(vO.z*0.9 - uTime*26., 70.) - 35.)/4., 2.));
            float a = (f*1.15 + 0.035 + band*0.5*f) * uA * uJ; if (a < 0.002) discard; gl_FragColor = vec4(uC * a, 1.); }`,
      });
      this.ghostU.push({ uA, uTime }); if (bone) this.boneU.push(uA); return new T3.Mesh(g, m);
    };

    const box = new T3.Box3();
    for (const p of d.parts) {
      const g = geoOf(p);
      if (p.group === 'bone') {
        inner.add(ghost(g, 0x8fe9ff, p.id.includes('maxilla') ? 'up' : 'low', 1, true)); continue;
      }
      if (p.group === 'pulp') { const m = ghost(g, 0xff7a4d, (p.fdi as number) < 30 ? 'up' : 'low', 0); inner.add(m); this.teeth.set(-(p.fdi as number), { mesh: m, u: {}, center: new T3.Vector3(), ghost: m }); continue; }
      const fdi = p.fdi as number, bb = g.boundingBox as T.Box3, center = bb.getCenter(new T3.Vector3()); box.union(bb);
      const upper = fdi < 30, tip = upper ? bb.min.z : bb.max.z, dir = upper ? -1 : 1, extent = bb.max.z - bb.min.z;
      const st = DEMO_CHART[fdi], u: Record<string, T.IUniform> = {
        uState: { value: st ? STATE_CODE[st] : 0 }, uShow: { value: 0 }, uSolid: { value: 0 }, uDim: { value: 0 }, uPlan: { value: PLAN.includes(fdi) ? 1 : 0 },
        uOut: { value: center.x < -64 ? -1 : 1 }, uBuc: { value: new T3.Vector2(center.x + 64, center.y - 28).normalize().multiplyScalar(2.6) }, uTip: { value: tip }, uDir: { value: dir }, uCrownH: { value: extent * 0.4 }, uC: { value: center }, uJ: upper ? this.jawU.up : this.jawU.low,
      };
      const mat = new T3.MeshPhysicalMaterial({ color: 0xe6dcc6, roughness: 0.36, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.4, sheen: 0.3, sheenColor: new T3.Color(0xfff1d6), side: st === 'rootcanal' ? T3.DoubleSide : T3.FrontSide });
      mat.onBeforeCompile = (s) => {
        Object.assign(s.uniforms, u);
        s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
        s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vObj; uniform float uState,uShow,uSolid,uDim,uPlan,uTip,uDir,uCrownH,uJ,uOut; uniform vec3 uC; uniform vec2 uBuc;\n${NOISE}\nfloat dith(){ return fract(52.9829189*fract(dot(gl_FragCoord.xy, vec2(.06711056,.00583715)))); }`)
          .replace('#include <color_fragment>', `#include <color_fragment>
            float dd = (uTip - vObj.z) * uDir; float neck = uCrownH; bool crown = dd < neck;
            float reveal = uSolid * uJ; if (dith() > reveal) discard;
            if (uState > 5.5) { if (dith() < uShow) discard; }
            if (uState > 3.5 && uState < 4.5 && !crown && dith() < uShow) discard;
            float s = uShow;
            vec3 P = vec3(uC.xy + uBuc, uTip - uDir * uCrownH * .55); float pd = length(vObj - P) + (vn(vObj*1.6) - .5) * 1.8;
            if (uState > .5 && uState < 1.5) { float m = (1. - smoothstep(3.4, 5.0, pd)) * step(dd, uCrownH * 1.05); float sp = smoothstep(.35, .65, vn(vObj*1.3)); diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(.30,.17,.08), vec3(.10,.05,.03), sp), m * s); }
            if (uState > 1.5 && uState < 2.5) { float m = (1. - smoothstep(3.0, 3.8, pd)) * step(dd, uCrownH); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.62,.66,.70), m * s); }
            if (uState > 2.5 && uState < 3.5 && crown) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.89,.69,.29), s);
            if (uState > 3.5 && uState < 4.5 && crown) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.97,.97,.95), s);
            if (uState > 4.5 && uState < 5.5 && s > .5 && (vObj.x - uC.x) * uOut > 0.) discard;
            diffuseColor.rgb *= mix(1., .28, uDim * (1. - uPlan));`)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif (uState > 2.5 && uState < 3.5 && crown) roughnessFactor = mix(roughnessFactor, .22, s);')
          .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nif (uState > 2.5 && uState < 3.5 && crown) metalnessFactor = mix(0., .95, s);');
      };
      const mesh = new T3.Mesh(g, mat); mesh.userData['fdi'] = fdi; inner.add(mesh);
      const gh = ghost(g, 0xc9f6ff, upper ? 'up' : 'low', 1); inner.add(gh);
      this.teeth.set(fdi, { mesh, u, center, ghost: gh });
      if (st === 'implant') this.buildImplant(inner, center, tip, dir, extent);
    }
    for (const [k, v] of this.teeth) if (k < 0) { const t = this.teeth.get(-k); if (t) t.pulp = v.mesh; }
    box.getCenter(this.center); inner.position.copy(this.center).negate();
    const ro = new ResizeObserver(() => this.resize()); ro.observe(o.canvas.parentElement ?? o.canvas); this.cleanup.push(() => ro.disconnect());
    const io = new IntersectionObserver((e) => { this.visible = e[0].isIntersecting; this.kick(); }); io.observe(o.canvas); this.cleanup.push(() => io.disconnect());
    const vis = () => this.kick(); document.addEventListener('visibilitychange', vis); this.cleanup.push(() => document.removeEventListener('visibilitychange', vis));
    this.pointer(); this.makeTags(); this.resize(); this.setStep(0, true);
  }

  /** A threaded titanium screw and its abutment, placed where the lost root would be. */
  private buildImplant(parent: T.Group, c: T.Vector3, tip: number, dir: number, extent: number): void {
    const T3 = this.three, pts: T.Vector2[] = [], len = 13, r = 2.15;
    for (let i = 0; i <= 64; i++) { const y = (i / 64) * len; pts.push(new T3.Vector2(r + (i % 4 < 2 ? 0.28 : -0.12) * (y < len - 1.5 ? 1 : 0.2) - y * 0.012, -y)); }
    pts.push(new T3.Vector2(0, -len)); pts.unshift(new T3.Vector2(0, 0), new T3.Vector2(r + 0.35, 0), new T3.Vector2(1.5, 0.6), new T3.Vector2(1.5, 2.6));
    const g = new T3.LatheGeometry(pts, 40); g.rotateX(Math.PI / 2); // lathe axis Y -> Z
    const m = new T3.Mesh(g, new T3.MeshStandardMaterial({ color: 0xcfd6dc, metalness: 1, roughness: 0.28, side: T3.DoubleSide }));
    const neckZ = tip - dir * extent * 0.4; m.position.set(c.x, c.y, neckZ); m.scale.set(1, 1, dir > 0 ? 1 : -1); (m.material as T.MeshStandardMaterial).transparent = false; m.visible = false; m.userData['neckZ'] = neckZ;
    parent.add(m); this.implant = m;
  }

  private makeTags(): void {
    const layer = this.o.layer; layer.replaceChildren();
    for (const [fdi, t] of this.teeth) if (fdi > 0) { void t; const e = document.createElement('span'); e.className = 'jtag'; e.textContent = String(fdi); layer.append(e); this.tags.set(fdi, e); }
    this.tip = document.createElement('div'); this.tip.className = 'tip'; this.tip.hidden = true; layer.append(this.tip);
  }

  private pointer(): void {
    const c = this.o.canvas, host = c.parentElement ?? c;
    const down = (e: PointerEvent) => { this.dragging = true; this.lastX = e.clientX; this.vel = 0; this.kick(); host.setPointerCapture?.(e.pointerId); };
    const up = () => { this.dragging = false; };
    const move = (e: PointerEvent) => {
      if (this.dragging) { const dx = e.clientX - this.lastX; this.lastX = e.clientX; this.userAz += dx * 0.006; this.vel = dx * 0.006; }
      const r = c.getBoundingClientRect(), v = new this.three.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(v, this.camera);
      const hit = this.raycaster.intersectObjects([...this.teeth.values()].filter((t) => t.u['uSolid'] && t.mesh.visible).map((t) => t.mesh), false)[0];
      const fdi = hit ? (hit.object.userData['fdi'] as number) : null;
      if (fdi !== this.hover) { this.hover = fdi; this.kick(); }
      if (fdi !== null && this.cur.solid > 0.5) {
        const st = DEMO_CHART[fdi], label = `${this.o.tooth} ${fdi}${st && this.cur.show > 0.5 ? ' · ' + this.o.names[st] : ''}`; this.tip.textContent = label; this.tip.hidden = false;
        this.tip.style.left = `${e.clientX - r.left}px`; this.tip.style.top = `${e.clientY - r.top}px`;
      } else this.tip.hidden = true;
    };
    const leave = () => { this.hover = null; this.tip.hidden = true; };
    host.addEventListener('pointerdown', down); window.addEventListener('pointerup', up); host.addEventListener('pointermove', move); host.addEventListener('pointerleave', leave);
    this.cleanup.push(() => { host.removeEventListener('pointerdown', down); window.removeEventListener('pointerup', up); host.removeEventListener('pointermove', move); host.removeEventListener('pointerleave', leave); });
  }

  /** `hero` is the opening composition: the charted mouth turning slowly. Steps 0 to 3 are the story. */
  setStep(step: number, hero = false, jump = false): void {
    this.step = step; this.hero = hero; const v = VIEW[hero ? 2 : step], s = hero ? 2 : step;
    Object.assign(this.tgt, { az: v.az, el: v.el, d: hero ? 205 : v.d, up: v.jaws & 1 ? 1 : 0, low: v.jaws & 2 ? 1 : 0, scan: s === 0 ? 1 : s === 1 ? 0.22 : 0.16, solid: s >= 1 ? 1 : 0, show: s >= 2 ? 1 : 0, dim: s === 3 ? 1 : 0, labels: s === 1 ? 1 : s === 3 ? 3 : s === 2 && !hero ? 2 : 0 });
    if (jump || this.o.reduced) Object.assign(this.cur, this.tgt); this.kick();
  }

  private resize(): void {
    const el = this.o.canvas.parentElement ?? this.o.canvas, w = el.clientWidth || 1, h = el.clientHeight || 1;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h;
    this.camera.setViewOffset(w, h, -w * 0.16, 0, w, h); this.camera.updateProjectionMatrix(); this.kick();
  }
  private kick(): void { if (!this.running) { this.running = true; this.last = performance.now(); this.raf = requestAnimationFrame(this.frame); } }
  private frame = (now: number): void => {
    const dt = Math.min((now - this.last) / 1000, 0.05); this.last = now;
    if (!this.visible || document.hidden) { this.running = false; return; }
    this.t += dt; const k = 1 - Math.exp(-dt * 2.6), c = this.cur, g = this.tgt;
    let moving = false;
    for (const key of ['az', 'el', 'd', 'up', 'low', 'scan', 'solid', 'show', 'dim'] as const) { const diff = g[key] - c[key]; if (Math.abs(diff) > 1e-3) { c[key] += diff * k; moving = true; } else c[key] = g[key]; }
    if (!this.dragging) { this.userAz += this.vel; this.vel *= 0.92; }
    const auto = this.o.reduced || this.dragging ? 0 : this.hero ? 0.12 : this.step === 1 ? 0 : 0.04; this.userAz += auto * dt; if (auto) moving = true;
    this.jawU.up.value = c.up; this.jawU.low.value = c.low;
    for (const u of this.ghostU) u.uTime.value = this.t;
    for (const u of this.boneU) u.value = c.scan * (this.step === 0 ? 1 : 0.55);
    for (const [fdi, t] of this.teeth) {
      if (fdi < 0) { const on = DEMO_CHART[-fdi] === 'rootcanal'; (t.mesh.material as T.ShaderMaterial).uniforms['uA'].value = on ? c.show * 0.95 : c.scan * 0.7; continue; }
      t.u['uSolid'].value = c.solid; t.u['uShow'].value = c.show; t.u['uDim'].value = c.dim;
      (t.ghost.material as T.ShaderMaterial).uniforms['uA'].value = (1 - c.solid) * 0.9 + (fdi === this.hover ? 0.5 : 0);
      t.mesh.visible = c.solid > 0.01;
    }
    if (this.implant) { const s = this.cur.show; this.implant.visible = s > 0.02; this.implant.scale.z = (this.implant.scale.z < 0 ? -1 : 1) * Math.max(s, 0.001); }
    this.spin.rotation.y = c.az + this.userAz; this.camera.position.set(0, Math.sin(c.el) * c.d, Math.cos(c.el) * c.d); this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera); this.placeTags();
    if (moving || this.dragging || Math.abs(this.vel) > 1e-4 || this.cur.show !== this.tgt.show) this.raf = requestAnimationFrame(this.frame); else this.running = false;
  };

  private placeTags(): void {
    const T3 = this.three, mode = this.tgt.labels, el = this.o.canvas, w = el.clientWidth, h = el.clientHeight, v = new T3.Vector3(); let n = 0;
    for (const [fdi, tag] of this.tags) {
      const t = this.teeth.get(fdi); const st = DEMO_CHART[fdi];
      const show = !!t && ((mode === 1 && fdi > 30) || (mode === 2 && st !== undefined) || (mode === 3 && PLAN.includes(fdi)));
      if (!show || !t) { tag.hidden = true; continue; }
      v.copy(t.center).sub(this.center); v.set(v.x, v.z, -v.y).applyAxisAngle(new T3.Vector3(0, 1, 0), this.spin.rotation.y);
      v.project(this.camera); const behind = v.z > 1; tag.hidden = behind;
      tag.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
      tag.textContent = mode === 3 ? String(PLAN.indexOf(fdi) + 1) : String(fdi); n++;
      tag.style.setProperty('--dot', mode === 2 && st ? STATE_DOT[st] : 'transparent'); tag.classList.toggle('jtag--chart', mode === 2);
    }
    void n;
  }

  dispose(): void {
    cancelAnimationFrame(this.raf); this.running = false; this.cleanup.forEach((f) => f());
    this.scene.traverse((o) => { const m = o as T.Mesh; m.geometry?.dispose?.(); const mat = m.material as T.Material | undefined; mat?.dispose?.(); });
    this.renderer.dispose(); this.o.layer.replaceChildren();
  }
}
