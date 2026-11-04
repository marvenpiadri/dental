import type { ToothRecord } from './engine/chart';

export type Three = typeof import('three');
const ZONES = ['mesial', 'distal', 'buccal', 'lingual', 'occlusal'] as const;
// 0 clean, 1 caries, 2 amalgam, 3 composite, 4 glass ionomer, 5 temporary
const CODE = (t: ToothRecord, z: string): number => {
  if (t.fillingSurfaces.has(z)) { const m = String(t.fillingSurfaceMaterials.get(z) ?? t.fillingMaterial); return m.includes('amalgam') ? 2 : m.includes('composite') ? 3 : m.includes('glass') ? 4 : 5; }
  return t.caries.has('caries-' + z) ? 1 : 0;
};

/** One mesh of the tooth library built by tools/tooth-lib/build.py (mm, origin at the neck, +y toward the bite, +z toward the lip). */
export interface LibPart { id: string; kind: 'crown' | 'root' | 'rootbroken' | 'trunk' | 'pulp' | 'shell' | 'prep' | 'hardware'; fdi: number; mesial?: number; slot?: number; key?: string; tip?: number[]; broken?: string; vertexCount: number; indexCount: number; pos: number; nrm: number; idx: number; zoneA?: number; zoneB?: number; bounds: number[][] }
export interface LibData { buf: ArrayBuffer; parts: Map<string, LibPart> }
let lib: Promise<LibData> | null = null;
/** The library (about 11 MB), fetched once and shared by every overlay. */
export const loadLib = (): Promise<LibData> => (lib ??= Promise.all([fetch('/models/teeth/teeth.json').then((r) => r.json()), fetch('/models/teeth/teeth.bin').then((r) => r.arrayBuffer())])
  .then(([m, buf]) => ({ buf, parts: new Map((m.parts as LibPart[]).map((p) => [p.id, p])) }))
  .catch((e) => { lib = null; throw e; }));

const VERT = `attribute vec4 zoneA; attribute vec4 zoneB; varying vec3 vP; varying vec3 vN; varying vec4 vA; varying vec4 vB;
void main(){ vP = position; vN = normalize(normalMatrix * normal); vA = zoneA; vB = zoneB; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
// The weights come baked into the mesh: caries fades across a surface boundary, fillings and restorations keep a crisp edge.
const NOISE = `float h3(vec3 q){ return fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float vn(vec3 q){ vec3 i = floor(q), f = fract(q); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float spotsT(vec3 q, float t){ return smoothstep(0.5 + t, 0.62 + t, vn(q * 1.7) * 0.6 + vn(q * 4.3) * 0.4); }
float spots(vec3 q){ return spotsT(q, 0.0); }   // black decay spots
`;
const FRAG = `uniform float uCode[5]; uniform float uSev[5]; uniform float uDef[5]; uniform float uAlpha; uniform float uCutY; uniform float uMode; uniform vec3 uRestCol; uniform float uRestSpec; uniform float uLeak;
uniform float uTop; uniform vec4 uExt; uniform float uMes; uniform vec4 uCase; uniform float uHi[5]; uniform float uHiCerv; uniform float uCervical; uniform float uDisc; uniform float uSeal; uniform float uCalc; uniform float uRootCar; uniform vec3 uBase;
varying vec3 vP; varying vec3 vN; varying vec4 vA; varying vec4 vB;
${NOISE}
float hash(vec2 q){ return fract(sin(dot(floor(q), vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec3 p = vP;
  if (p.y > uCutY || p.y < 0.015) discard;         // worn or broken crown; the flat cap cut at the neck is never seen
  float w[5]; w[0] = vA.x; w[1] = vA.y; w[2] = vA.z; w[3] = vA.w; w[4] = vB.x;
  float bd = 0.0;
  if (uTop > 0.5) { // surface view: five crisp areas cut from the top, with a visible border between them
    float a = (p.x - uExt.z) * uMes / uExt.x, b = (p.z - uExt.w) / uExt.y;
    float m = max(abs(a), abs(b));
    for (int i = 0; i < 5; i++) w[i] = 0.0;
    if (m < 0.5) w[4] = 1.0; else if (abs(a) > abs(b)) { if (a > 0.0) w[0] = 1.0; else w[1] = 1.0; } else { if (b > 0.0) w[2] = 1.0; else w[3] = 1.0; }
    bd = 1.0 - smoothstep(0.012, 0.032, min(abs(m - 0.5), m < 0.5 ? 9.0 : abs(abs(a) - abs(b))));
  }
  if (uMode == 2.0 && w[2] < 0.5) discard;          // veneer: lip side only
  if (uMode == 3.0 && w[4] < 0.5) discard;          // inlay / onlay: biting face only
  vec3 col = uBase; float spec = 0.25; float shin = 24.0;
  if (uMode >= 1.0) { // a restoration shell
    col = uRestCol; spec = uRestSpec; shin = 70.0 * uRestSpec + 10.0;
    col = mix(col, vec3(0.1, 0.06, 0.03), uLeak * smoothstep(0.35, 0.9, vB.y) * 0.85);
    col = mix(col, uRestCol * 0.45, 0.8 * smoothstep(0.8, 0.88, vB.y) * (1.0 - smoothstep(0.9, 0.97, vB.y))); // visible margin where the restoration meets the neck
  } else {
    if (uDisc == 1.0) col = mix(col, vec3(0.62, 0.6, 0.45), 0.55);
    if (uDisc == 2.0) col = mix(col, vec3(1.0), 0.5 * step(0.7, hash(p.xy * 5.0 + p.z * 3.0)));
    if (uDisc == 3.0) col = mix(col, vec3(0.45, 0.45, 0.48), 0.6);
    if (uDisc == 4.0) col = mix(col, vec3(0.5, 0.33, 0.15), 0.35 + 0.2 * hash(p.xz * 6.0));
    if (uDisc == 5.0) col = mix(col, vec3(0.7, 0.55, 0.4), 0.4);
    if (uSeal > 0.5) { col = mix(col, vec3(0.75, 0.85, 0.95), 0.5 * w[4]); }
    for (int i = 0; i < 5; i++) {
      float c = uCode[i];
      if (c == 1.0) { float cw = smoothstep(0.1, 0.7, w[i]), sv = uSev[i] / 6.0; float a = (0.3 + 0.3 * sv) * cw; col = mix(col, vec3(0.55, 0.05, 0.1), a);
        float n = vn(p * 1.7) * 0.6 + vn(p * 4.3) * 0.4;   // soft black taint, deeper with severity; never opaque so the area borders stay readable
        float taint = smoothstep(0.3, 0.75, n) * (0.3 + 0.4 * sv) + smoothstep(0.68, 0.8, n) * 0.25 * sv;
        col = mix(col, vec3(0.06, 0.03, 0.025), clamp(taint, 0.0, 0.7) * cw); spec = mix(spec, 0.05, a); }
      else if (c > 1.0) {
        float a = smoothstep(0.42, 0.58, w[i]);
        vec3 fc = c == 2.0 ? vec3(0.42, 0.47, 0.56) : c == 3.0 ? vec3(0.16, 0.72, 0.85) : c == 4.0 ? vec3(0.62, 0.84, 0.25) : vec3(0.96, 0.5, 0.68);
        col = mix(col, fc, a);
        if (uDef[i] > 0.5) { float ring = smoothstep(0.15, 0.42, w[i]) * (1.0 - smoothstep(0.42, 0.62, w[i])); col = mix(col, vec3(0.04, 0.02, 0.012), clamp(ring * 0.9 + spots(p * 1.5) * 0.3 * a, 0.0, 0.7)); } // decay creeping under a failing filling
        spec = mix(spec, c == 2.0 ? 1.0 : c == 3.0 ? 0.1 : 0.8, a); shin = mix(shin, c == 2.0 ? 90.0 : 12.0, a);
      }
    }
    if (uCervical > 0.5) col = mix(col, vec3(0.45, 0.38, 0.28), 0.6 * smoothstep(0.55, 0.9, vB.y));
    col = mix(col, vec3(0.04, 0.025, 0.015), uRootCar * 0.3 * smoothstep(0.62, 0.9, vB.y) * clamp(spots(p * 1.3) * 1.6 + 0.25, 0.0, 1.0)); // decay at the neck
    col = mix(col, vec3(0.78, 0.66, 0.4), uCalc * smoothstep(0.5, 0.85, vB.y) * 0.8);
  }
  col = mix(col, uCase.rgb, uCase.a);                      // planned / needed work tints the whole crown
  float sel = 0.0, hov = 0.0;
  for (int i = 0; i < 5; i++) { sel += w[i] * step(0.9, uHi[i]); hov += w[i] * step(0.4, uHi[i]) * (1.0 - step(0.9, uHi[i])); }
  float neck = smoothstep(0.4, 0.9, vB.y);
  sel += uHiCerv * step(0.9, uHiCerv) * neck; hov += uHiCerv * (1.0 - step(0.9, uHiCerv)) * neck * 2.0;
  col = mix(col, vec3(0.13, 0.83, 0.93), clamp(hov, 0.0, 1.0) * 0.55);   // hover: cyan
  col = mix(col, uTop > 0.5 ? vec3(0.1, 0.72, 0.32) : vec3(1.0, 0.62, 0.04), clamp(sel, 0.0, 1.0) * (uTop > 0.5 ? 0.92 : 0.78));    // selected: amber (green in the surface view)
  col = mix(col, vec3(0.08, 0.1, 0.13), bd * 0.9);
  if (!gl_FrontFacing) col = vec3(0.93, 0.84, 0.7);   // the cut face of a pulled-apart piece shows dentin
  vec3 N = normalize(vN); vec3 L = normalize(vec3(0.4, 0.8, 0.6)); vec3 V = vec3(0.0, 0.0, 1.0);
  float d = abs(dot(N, L)) * 0.6 + 0.5; float s = pow(max(dot(reflect(-L, N), V), 0.0), shin) * spec;
  gl_FragColor = vec4(col * d + vec3(s), uAlpha);
}`;
const ROOT_FRAG = `uniform float uWork; uniform float uHiSel; uniform vec4 uCaseRoot; uniform float uAlpha; uniform float uCalc; uniform float uRootCar; uniform float uRootLen; uniform float uBroken; varying vec3 vP; varying vec3 vN;
${NOISE}
void main(){
  if (vP.y > -0.015) discard;
  vec3 col = vec3(0.94, 0.92, 0.86);
  if (uCalc > 0.5) col = mix(col, vec3(0.78, 0.66, 0.4), 0.8 * smoothstep(-2.4, -1.2, vP.y));
  if (uRootCar > 0.0) col = mix(col, uRootCar > 1.5 ? vec3(0.12, 0.07, 0.04) : vec3(0.42, 0.3, 0.15), 0.8 * smoothstep(-6.0, -4.5, vP.y));
  col = mix(col, uCaseRoot.rgb, uCaseRoot.a);
  col = mix(col, vec3(0.12, 0.78, 0.42), uWork * 0.8);                                  // a root that was treated
  float sel = step(0.9, uHiSel), hov = step(0.4, uHiSel) * (1.0 - sel);
  col = mix(col, vec3(0.13, 0.83, 0.93), hov * 0.55);
  col = mix(col, vec3(1.0, 0.62, 0.04), sel * 0.78);
  if (!gl_FrontFacing) col = uBroken > 0.5 ? vec3(0.75, 0.2, 0.15) : vec3(0.55, 0.45, 0.35); // a fractured root shows its raw, red inside
  vec3 N = normalize(vN); float d = abs(dot(N, normalize(vec3(0.4, 0.8, 0.6)))) * 0.7 + 0.35;
  gl_FragColor = vec4(col * d, uAlpha);
}`;

const MAT: Record<string, [number, number, number, number]> = {
  emax: [0.97, 0.95, 0.9, 0.55], zircon: [0.98, 0.97, 0.94, 0.45], gold: [0.9, 0.7, 0.2, 1], metal: [0.62, 0.64, 0.67, 1],
  'metal-ceramic': [0.95, 0.92, 0.85, 0.5], gradia: [0.96, 0.9, 0.78, 0.2], telescope: [0.6, 0.62, 0.65, 1], temporary: [0.93, 0.7, 0.72, 0.1], none: [0.95, 0.93, 0.88, 0.4],
};

/** The triangles of a crown whose strongest surface weight is zone `i`, as a geometry sharing the crown's vertex data. */
function zonePiece(src: import('three').BufferGeometry, i: number): import('three').BufferGeometry {
  const A = src.getAttribute('zoneA'), B = src.getAttribute('zoneB'), ix = src.getIndex();
  const g = new (src.constructor as typeof import('three').BufferGeometry)();
  if (!A || !B || !ix) return g;
  const w = (v: number) => [A.getX(v), A.getY(v), A.getZ(v), A.getW(v), B.getX(v)];
  const keep: number[] = [];
  for (let t = 0; t < ix.count; t += 3) {
    const s = [0, 0, 0, 0, 0];
    for (let k = 0; k < 3; k++) w(ix.getX(t + k)).forEach((x, j) => { s[j] += x; });
    if (s.indexOf(Math.max(...s)) === i) keep.push(ix.getX(t), ix.getX(t + 1), ix.getX(t + 2));
  }
  for (const n of ['position', 'normal', 'zoneA', 'zoneB']) g.setAttribute(n, src.getAttribute(n));
  g.setIndex(keep);
  return g;
}

/** The scene for one tooth built from the library. Shared by the live 3D view and anything that needs a snapshot of a tooth. */
export function makeToothScene(T: Three, data: LibData, renderer: import('three').WebGLRenderer, onNewTooth: () => void = () => undefined, onRender: () => void = () => undefined) {
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(2.5, 1, 7.5).setLength(9);
  const render = () => { renderer.render(scene, camera); onRender(); };

  const cache = new Map<string, import('three').BufferGeometry>();
  const geometry = (id: string): import('three').BufferGeometry | null => {
    const hit = cache.get(id); if (hit) return hit;
    const p = data.parts.get(id); if (!p) return null;
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(data.buf, p.pos, p.vertexCount * 3), 3));
    g.setAttribute('normal', new T.BufferAttribute(new Float32Array(data.buf, p.nrm, p.vertexCount * 3), 3));
    g.setIndex(new T.BufferAttribute(new Uint16Array(data.buf, p.idx, p.indexCount), 1));
    if (p.zoneA !== undefined) g.setAttribute('zoneA', new T.BufferAttribute(new Uint8Array(data.buf, p.zoneA, p.vertexCount * 4), 4, true));
    if (p.zoneB !== undefined) g.setAttribute('zoneB', new T.BufferAttribute(new Uint8Array(data.buf, p.zoneB, p.vertexCount * 4), 4, true));
    cache.set(id, g);
    return g;
  };

  const shared = { uAlpha: { value: 1 }, uCalc: { value: 0 }, uRootCar: { value: 0 }, uHi: { value: [0, 0, 0, 0, 0] }, uHiCerv: { value: 0 }, uTop: { value: 0 }, uExt: { value: new T.Vector4(1, 1, 0, 0) }, uMes: { value: 1 }, uCase: { value: new T.Vector4(0, 0, 0, 0) }, uCaseRoot: { value: new T.Vector4(0, 0, 0, 0) }, uRootLen: { value: -12 } };
  const U = () => ({ ...shared, uCode: { value: [0, 0, 0, 0, 0] }, uSev: { value: [0, 0, 0, 0, 0] }, uDef: { value: [0, 0, 0, 0, 0] }, uCutY: { value: 99 }, uMode: { value: 0 }, uRestCol: { value: new T.Vector3(1, 1, 1) }, uRestSpec: { value: 0.3 },
    uLeak: { value: 0 }, uCervical: { value: 0 }, uDisc: { value: 0 }, uSeal: { value: 0 }, uBase: { value: new T.Vector3(0.93, 0.91, 0.85) } });
  const crownU = U(), shellU = U(); shellU.uMode.value = 1;
  const mk = (u: ReturnType<typeof U>) => new T.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: FRAG, transparent: true, side: T.DoubleSide });
  const crown = new T.Mesh(undefined, mk(crownU));
  const prep = new T.Mesh(undefined, mk(crownU));
  const shell = new T.Mesh(undefined, mk(shellU));
  const rootVert = 'varying vec3 vP; varying vec3 vN; void main(){ vP = position; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
  const rootMat = (hi: { value: number }, broken: { value: number }, work: { value: number }) => new T.ShaderMaterial({ uniforms: { ...shared, uHiSel: hi, uBroken: broken, uWork: work }, vertexShader: rootVert, fragmentShader: ROOT_FRAG, transparent: true, side: T.DoubleSide });
  const his = [{ value: 0 }, { value: 0 }, { value: 0 }, { value: 0 }];   // [0] the trunk (never selected on its own), [1..3] the three root slots
  const brk = [{ value: 0 }, { value: 0 }, { value: 0 }, { value: 0 }], work = [{ value: 0 }, { value: 0 }, { value: 0 }, { value: 0 }];
  const trunk = new T.Mesh(undefined, rootMat(his[0], brk[0], work[0]));
  const rootMeshes = [1, 2, 3].map((k) => new T.Mesh(undefined, rootMat(his[k], brk[k], work[k])));
  const rootParts = [trunk, ...rootMeshes];
  const pulpMat = new T.MeshStandardMaterial({ color: 0xd9626b, roughness: 0.5, transparent: true, opacity: 0.9 });
  const pulp = new T.Mesh(undefined, pulpMat);
  const steel = new T.MeshStandardMaterial({ color: 0xb4bcc4, metalness: 0.3, roughness: 0.4 });
  const gold = new T.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.3, roughness: 0.4 });
  const hw = (id: string, m = steel) => { const mesh = new T.Mesh(geometry(id) ?? undefined, m); mesh.visible = false; return mesh; };
  const fixture = hw('hw-implant-fixture'), abutment = hw('hw-abutment'), healing = hw('hw-healing-cap', gold), cover = hw('hw-cover-screw'), bracket = hw('hw-bracket'), band = hw('hw-band');
  // Home-made hardware (not in the scan library): braces = bracket + archwire + elastic ties,.
  const braces = new T.Group();
  { const wireM = new T.MeshStandardMaterial({ color: 0xcfd6dc, metalness: 0.7, roughness: 0.25 }), tie = new T.MeshStandardMaterial({ color: 0x1fb6a6, roughness: 0.6 });
    const bk = new T.Mesh(new T.BoxGeometry(3.4, 2.4, 1.1), new T.MeshStandardMaterial({ color: 0xe4e8ec, metalness: 0.4, roughness: 0.3 })); const slot = new T.Mesh(new T.BoxGeometry(3.4, 0.5, 0.5), new T.MeshStandardMaterial({ color: 0x40464c })); slot.position.z = 0.45;
    const wire = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 24, 10), wireM); wire.rotation.z = Math.PI / 2; wire.position.z = 0.65;
    const ties = [-1.1, 1.1].map((x) => { const r = new T.Mesh(new T.TorusGeometry(0.42, 0.14, 8, 16), tie); r.position.set(x, 0, 0.65); r.rotation.y = Math.PI / 2; return r; });
    braces.add(bk, slot, wire, ...ties);
  }
  const ringMat = new T.MeshStandardMaterial({ color: 0xe06a7a, roughness: 0.5 }), ring = new T.Mesh(new T.TorusGeometry(2.6, 0.45, 8, 28), ringMat); ring.rotation.x = Math.PI / 2; ring.visible = false; // inflamed gum collar around an implant
  band.material = new T.MeshStandardMaterial({ color: 0xc9d0d6, metalness: 0.7, roughness: 0.3, side: T.DoubleSide });
  braces.scale.setScalar(1.35);
  braces.visible = false;
  // Implant fixture: a titanium screw with helical threads, a microthreaded collar, a tapered apex with cutting flutes and a hex socket.
  fixture.material = new T.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, metalness: 0.75, roughness: 0.38 });
  const hexSocket = new T.Mesh(new T.CylinderGeometry(1.0, 1.0, 0.12, 6), new T.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.6 }));
  const fixtureGeometry = (len: number, r0: number) => {
    const NY = 220, NA = 48, pitch = 0.85, depth = 0.4, pos: number[] = [], col: number[] = [], idx: number[] = [];
    for (let j = 0; j <= NY; j++) {
      const y = -(len * j) / NY, d = -y / len, apex = Math.max(0, (d - 0.78) / 0.22), neck = d < 0.12;
      for (let i = 0; i <= NA; i++) {
        const a = (i / NA) * Math.PI * 2, ph = -y / pitch - a / (Math.PI * 2), fr = ph - Math.floor(ph), tri = 1 - Math.abs(2 * fr - 1);
        let r = (neck ? r0 + 0.12 * (0.5 + 0.5 * Math.cos((-y / 0.28) * Math.PI * 2)) : r0 - depth + depth * tri) * (1 - 0.5 * apex ** 1.6);
        if (apex > 0 && Math.abs(Math.sin(1.5 * a)) < 0.12) r *= 0.7; // three cutting flutes
        if (j === NY) r = 0;
        const t = neck ? 0.6 : tri;
        pos.push(r * Math.cos(a), y, r * Math.sin(a)); col.push(0.34 + 0.5 * t, 0.37 + 0.5 * t, 0.4 + 0.5 * t);
      }
    }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NA; i++) { const p = j * (NA + 1) + i, q = p + NA + 1; idx.push(p, q, p + 1, p + 1, q, q + 1); }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  };
  // Clinical cue glyphs: mobility arrows, healing wound, parapulpal pins, gum margin (recession), open-contact dots.
  const mobMat = new T.MeshStandardMaterial({ color: 0xe8a317, roughness: 0.5 }), mob = new T.Group();
  for (const sg of [1, -1]) { const sh = new T.Mesh(new T.CylinderGeometry(0.25, 0.25, 2, 10), mobMat); sh.rotation.x = Math.PI / 2; sh.position.z = sg * 1.2; const cone = new T.Mesh(new T.ConeGeometry(0.65, 1.3, 14), mobMat); cone.rotation.x = sg * Math.PI / 2; cone.position.z = sg * 2.8; mob.add(sh, cone); }
  const wound = new T.Mesh(new T.SphereGeometry(1, 16, 10), new T.MeshStandardMaterial({ color: 0xb3202f, roughness: 0.5 })); wound.scale.set(2.2, 0.8, 2.2);
  const pin = new T.Group(); for (const x of [-0.9, 0.9]) { const p = new T.Mesh(new T.CylinderGeometry(0.18, 0.18, 1.8, 8), steel); p.position.x = x; pin.add(p); }
  const gumMat = new T.MeshStandardMaterial({ color: 0xe58a9b, roughness: 0.7 }), gum = new T.Mesh(new T.TorusGeometry(1, 0.5, 8, 32), gumMat); gum.rotation.x = Math.PI / 2;
  const contactDots = [1, -1].map(() => new T.Mesh(new T.SphereGeometry(0.45, 10, 8), new T.MeshStandardMaterial({ color: 0xd62839, roughness: 0.5 })));
  for (const m of [mob, wound, pin, gum, ...contactDots]) m.visible = false;
  const lesion = new T.Mesh(new T.SphereGeometry(1, 20, 14), new T.MeshStandardMaterial({ color: 0x5a1e2a, transparent: true, opacity: 0.55, roughness: 0.6 }));
  const group = new T.Group(); // the invisible container: pose and visibility live here, the meshes inside only swap
  const empty = new T.BufferGeometry();
  // Exploded view: the natural crown cut into its five surfaces, each its own mesh (same material, so colours and highlight carry over).
  const pieces = ZONES.map((z) => { const m = new T.Mesh(empty, crown.material); m.userData['zone'] = z; m.visible = false; return m; });
  group.add(...pieces, crown, prep, shell, trunk, ...rootMeshes, pulp, fixture, abutment, healing, cover, bracket, band, braces, ring, hexSocket, mob, wound, pin, gum, ...contactDots, lesion);
  scene.add(group, new T.AmbientLight(0xffffff, 0.8), new T.DirectionalLight(0xffffff, 1.5));

  let roots: { slot: number; key: string; tip: number[]; id: string; broken: string }[] = [];
  let explode = 0;
  let top = false;
  let last: [ToothRecord, number, boolean] | null = null;
  let shownFdi = 0, h = 10, ymin = -12, ymax = 10, mesial = 1, bounds: number[][] = [[0, 0, 0], [0, 0, 0]];
  const apply = (t: ToothRecord, no: number, showPulp: boolean) => {
    last = [t, no, showPulp];
    const sel = String((t as { toothSelection?: string }).toothSelection ?? '');
    const gone = sel === 'none' || sel.includes('no-tooth'), implant = sel === 'implant', underGum = sel === 'tooth-under-gum'; // 'none' is a gap: no tooth recorded there
    if (no !== shownFdi) {
      const c = data.parts.get(`crown-${no}`);
      const rts = [...data.parts.values()].filter((q) => q.kind === 'root' && q.fdi === no);
      if (!c || !rts.length) return;
      roots = rts.map((q) => ({ slot: q.slot ?? 1, key: q.key ?? 'single', tip: q.tip ?? [0, q.bounds[0][1], 0], id: q.id, broken: q.broken ?? '' }));
      trunk.geometry = geometry(`trunk-${no}`) ?? empty;
      rootMeshes.forEach((m, i) => { const r = roots.find((q) => q.slot === i + 1); m.geometry = r ? geometry(r.id)! : empty; });
      crown.geometry = geometry(`crown-${no}`)!; prep.geometry = geometry(`prep-${no}`)!; shell.geometry = geometry(`shell-${no}`)!;
      pulp.geometry = geometry(`pulp-${no}`) ?? new T.BufferGeometry();
      bounds = c.bounds; mesial = c.mesial ?? 1; h = c.bounds[1][1]; ymax = h; ymin = Math.min(...rts.map((q) => q.bounds[0][1])); shared.uRootLen.value = ymin;
      const scale = 4 / (ymax - ymin);
      group.scale.setScalar(scale);
      group.children.forEach((m) => { m.position.y = 0; });
      group.position.y = 0;
      // centre on the origin: shift everything so the tooth's middle sits at y = 0
      const mid = (ymin + ymax) / 2;
      group.children.forEach((m) => { m.position.y -= mid; });
      group.rotation.z = no < 30 ? Math.PI : 0; // roots up for the upper arch
      pieces.forEach((m, i) => { m.geometry.dispose(); m.geometry = zonePiece(crown.geometry, i); });
      onNewTooth();
      shownFdi = no;
    }
    const mid = (ymin + ymax) / 2;
    const R = t as unknown as Record<string, string | boolean | Set<string>>;
    const str = (k: string) => String(R[k] ?? '');
    crownU.uCode.value = ZONES.map((z) => CODE(t, z));
    crownU.uSev.value = ZONES.map((z) => t.cariesSeverity.get(z) ?? 0);
    crownU.uDef.value = ZONES.map((z) => (t.fillingSurfaces.has(z) && (R['fillingDefect'] as unknown as Map<string, string>).get(z) ? 1 : 0));
    // How much of the crown is left.
    const sub = str('toothSubstrate');
    let cut = 99;
    const cutBy = (d: number) => { cut = Math.min(cut, h - d); };
    if (R['brokenIncisal'] || R['brokenMesial'] || R['brokenDistal']) cutBy(h * 0.2);
    if (sub === 'broken') cutBy(h * 0.5);
    if (str('wearEdge') !== 'none') cutBy(h * 0.07);
    crownU.uCutY.value = cut;
    crownU.uCervical.value = str('wearCervical') !== 'none' ? 1 : 0;
    crownU.uDisc.value = str('pulpDx') === 'necrosis' && str('discoloration') === 'none' ? 3 : Math.max(0, ['none', 'tetracycline', 'fluorosis', 'nonvital', 'extrinsic', 'other'].indexOf(str('discoloration')));
    crownU.uSeal.value = R['fissureSealing'] ? 1 : 0;
    // Case colours (the same as the chart legend): the crown for planned or needed work, the root for resorption.
    const flag = (k: string) => !!R[k];
    shared.uCase.value.set(...(flag('extractionPlan') ? [0.9, 0.2, 0.2, 0.55] : flag('crownReplace') ? [1, 0.55, 0.1, 0.5] : flag('crownNeeded') ? [0.25, 0.5, 0.95, 0.45] : flag('bridgePillar') ? [0.6, 0.35, 0.85, 0.4] : [0, 0, 0, 0]) as [number, number, number, number]);
    shared.uCaseRoot.value.set(...(str('resorptionType') !== 'none' && str('resorptionType') !== '' ? [0.9, 0.45, 0.6, 0.5] : flag('extractionPlan') ? [0.9, 0.2, 0.2, 0.4] : [0, 0, 0, 0]) as [number, number, number, number]);
    shared.uCalc.value = R['calculus'] ? 1 : 0;
    shared.uRootCar.value = ({ none: 0, arrested: 1, active: 2, 'active-cavitated': 2 } as Record<string, number>)[str('rootCaries')] ?? 0;
    // Restorations: a crown/bridge replaces the crown by the library's shell; veneer and inlay/onlay are patches of it.
    const rt = str('restorationType'), rm = str('restorationMaterial');
    // No material chosen yet: the type itself sets the colour (as in the chart legend), so every restoration reads at a glance.
    const TYPE: Record<string, [number, number, number, number]> = { crown: [0.7, 0.82, 0.97, 0.5], bridge: [0.76, 0.62, 0.92, 0.5], veneer: [0.62, 0.92, 0.88, 0.4], inlay: [0.98, 0.78, 0.45, 0.6], onlay: [0.98, 0.78, 0.45, 0.6] };
    const base = MAT[rm && rm !== 'none' ? rm : ''], tint = TYPE[rt];
    const m = (base && tint ? base.map((v, i) => (i < 3 ? v * 0.5 + tint[i] * 0.5 : v)) : (base ?? tint ?? MAT['none'])) as [number, number, number, number]; // the material sets the look, the type tints it so a crown never passes for a natural tooth
    shellU.uRestCol.value.set(m[0], m[1], m[2]); shellU.uRestSpec.value = m[3];
    shellU.uLeak.value = R['crownLeakage'] ? 1 : 0;
    shellU.uMode.value = rt === 'veneer' ? 2 : rt === 'inlay' || rt === 'onlay' ? 3 : 1;
    const fullCover = rt === 'crown' || rt === 'bridge';
    const hasRest = fullCover || rt === 'veneer' || rt === 'inlay' || rt === 'onlay';
    // Pulp: its diagnosis, or the root filling.
    const endo = str('endo'), dx = str('pulpDx');
    const treated = endo !== 'none';
    pulpMat.color.set(treated ? (endo === 'endo-metal-pin' ? 0x444a50 : endo === 'endo-medical-filling' ? 0xb48ac8 : endo === 'endo-glass-pin' ? 0x9fd8d0 : 0xe49aa6)
      : dx === 'necrosis' ? 0x3a3a3a : dx === 'irreversible-pulpitis' ? 0xa1101f : dx === 'reversible-pulpitis' ? 0xe8505b : 0xeeb4b4);
    const pulpOn = showPulp || treated || dx !== 'normal';
    const pontic = sel === 'none' && rt === 'bridge'; // a bridge over a gap: the restoration shell stands alone as the pontic
    const gap = sel === 'none' && !pontic; // no tooth recorded there: shown solid grey
    const ghost = gone && !implant && !pontic && !gap; // an extracted tooth stays as a faint outline
    if (gap) { shared.uCase.value.set(0.5, 0.52, 0.55, 0.9); shared.uCaseRoot.value.set(0.5, 0.52, 0.55, 0.9); }
    crown.userData['ghost'] = ghost;
    const glass = ghost || underGum || gap || (pulpOn && !(implant && hasRest));
    shared.uAlpha.value = ghost ? 0.14 : underGum ? 0.25 : gap ? 0.7 : glass ? 0.35 : 1; // a tooth under the gum is shown faint
    for (const mesh of [crown, ...rootParts, prep, shell]) (mesh.material as import('three').ShaderMaterial).depthWrite = !glass;
    pulp.renderOrder = 1;
    // Presence and parts.
    const radix = sub === 'radix', stump = sub === 'crownprep';
    const naturalCrown = !implant && !radix && !stump && !(fullCover);
    crown.visible = (naturalCrown && !gone) || ghost || gap;
    prep.visible = !implant && stump && !gone;
    shell.visible = hasRest && (!gone || pontic) && (!implant ? true : fullCover);
    const rootsOn = !implant && (!gone || ghost || gap);
    trunk.visible = rootsOn && trunk.geometry !== empty;
    rootMeshes.forEach((m, i) => {
      const r = roots.find((q) => q.slot === i + 1), br = !!r && !!R[`brokenRoot${i + 1}`] && !!data.parts.get(r.broken);
      m.visible = rootsOn && !!r;
      if (r) m.geometry = geometry(br ? r.broken : r.id)!;
      brk[i + 1].value = br ? 1 : 0; work[i + 1].value = R[`rootWork${i + 1}`] ? 1 : 0;
    });
    pulp.visible = !implant && !gone && pulpOn;
    // Baby teeth reuse the permanent tooth of the same position, smaller with shorter roots and a bluer enamel.
    const milk = sel === 'milktooth';
    for (const m of [crown, shell, prep, ...pieces]) m.scale.setScalar(milk ? 0.82 : 1);
    const resect = flag('endoResection') ? 0.88 : 1; // apicoectomy: the root tip is cut
    for (const m of [trunk, ...rootMeshes, pulp]) m.scale.set(milk ? 0.82 : 1, (milk ? 0.65 : 1) * resect, milk ? 0.82 : 1);
    crownU.uBase.value.set(...(milk ? [0.96, 0.96, 0.94] : [0.93, 0.91, 0.85]) as [number, number, number]);
    if (ghost || gap) { crown.visible = true; shell.visible = false; }
    pieces.forEach((m) => { m.visible = explode > 0.01 && crown.visible && !ghost && !top; });
    shared.uTop.value = top ? 1 : 0;
    shared.uExt.value.set(Math.max((bounds[1][0] - bounds[0][0]) / 2, 0.1), Math.max((bounds[1][2] - bounds[0][2]) / 2, 0.1), (bounds[1][0] + bounds[0][0]) / 2, (bounds[1][2] + bounds[0][2]) / 2);
    shared.uMes.value = mesial;
    if (top) { for (const m of [...rootParts, pulp, lesion, fixture, abutment, healing, cover, bracket, band, braces, ring, hexSocket, mob, wound, pin, gum, ...contactDots, prep, ...pieces]) m.visible = false; }
    if (pieces[0].visible) crown.visible = false;
    layout();
    // Implant hardware, all positioned at the neck.
    const prosthesis = str('prosthesis');
    fixture.visible = implant;
    if (implant) {
      const len = Math.min(Math.max(-ymin * 0.8, 9), 13), r0 = no % 10 >= 6 ? 2.4 : no % 10 >= 4 ? 2.05 : 1.8, key = `${len.toFixed(1)}-${r0}`;
      if (fixture.userData['key'] !== key) { fixture.geometry.dispose(); fixture.geometry = fixtureGeometry(len, r0); fixture.userData['key'] = key; }
    }
    hexSocket.visible = implant && !(fullCover || prosthesis !== 'none');
    hexSocket.position.y = -mid + 0.05;
    abutment.visible = implant && (fullCover || prosthesis !== 'none' && prosthesis !== 'healing-abutment');
    healing.visible = implant && (prosthesis === 'healing-abutment' || (!fullCover && prosthesis === 'none'));
    cover.visible = false;
    for (const mesh of [fixture, abutment, healing, cover]) mesh.position.y = -mid;
    // Apical lesion at the root tip.
    const lesionKind = str('periapicalType') !== 'none' || /abscess|periodontitis/.test(str('apicalDx'));
    lesion.visible = lesionKind && !gone && !implant;
    lesion.scale.setScalar((ymax - ymin) * (/abscess|cyst/.test(str('periapicalType') + str('apicalDx')) ? 0.06 : 0.035));
    lesion.position.set(0, ymin - mid + (ymax - ymin) * 0.02, 0);
    // Orthodontic appliance on the lip side.
    bracket.visible = str('orthoAppliance') === 'bracket' && !gone && !implant;
    bracket.position.set(0, h * 0.5 - mid, bounds[1][2] * 0.85);
    // Malposition: rotation about the long axis, drift along the arch, vertical shift toward/away from the bite.
    const up = no < 30 ? -1 : 1, drift = str('orthoDrift'), vert = str('orthoVertical');
    group.rotation.y = flag('orthoRotation') ? 0.6 : 0;
    group.position.x = drift === 'mesial' ? 0.35 * mesial * up : drift === 'distal' ? -0.35 * mesial * up : 0;
    group.position.y = vert === 'extrusion' ? 0.3 * up : vert === 'intrusion' ? -0.3 * up : 0;
    const pi = str('periImplant');
    ring.visible = implant && pi !== 'none' && pi !== '';
    ringMat.color.set(pi === 'mucositis' ? 0xf0a0aa : pi === 'peri-implantitis-mild' ? 0xe06a7a : pi === 'peri-implantitis-moderate' ? 0xc2283d : 0x7a0f1f);
    ring.position.y = -mid + 0.5;
    const mg = str('mobility');
    mob.visible = mg !== '' && mg !== 'none'; mobMat.color.set(mg === 'm3' ? 0xd62839 : mg === 'm2' ? 0xf06a1a : 0xe8a317);
    mob.position.set(bounds[1][0] + 2.5, h * 0.55 - mid, 0);
    wound.visible = gone && !implant && !!flag('extractionWound'); wound.position.set(0, -mid - 0.3, 0);
    pin.visible = !gone && !!flag('parapulpalPin') && !implant; pin.position.set(0, h * 0.97 - mid, 0);
    const mc = ['none', 'i', 'ii', 'iii', 'iv'].indexOf(str('millerClass'));
    gum.visible = mc > 0 && !gone && !implant;
    gum.scale.setScalar(Math.max((bounds[1][0] - bounds[0][0]) / 2, 1) * 0.92);
    gumMat.color.set(mc >= 3 ? 0xd9627a : 0xe58a9b);
    gum.scale.z = gum.scale.x; gum.position.set(0, -mid - [0, 0.4, 1.0, 1.7, 2.5][Math.max(mc, 0)], 0);
    contactDots.forEach((d, i) => { const on = !gone && !!flag(i === 0 ? 'contactMesial' : 'contactDistal'); d.visible = on; d.position.set((i === 0 ? mesial : -mesial) * (bounds[1][0] - bounds[0][0]) / 2, h * 0.7 - mid, 0); });
    braces.visible = str('orthoAppliance') === 'braces' && !gone && !implant;
    braces.position.set(0, h * 0.5 - mid, bounds[1][2] * 0.85);
    const molarBraces = braces.visible && no % 10 >= 6; // molars carry a band with a tube instead of a bonded bracket
    band.visible = (str('orthoAppliance') === 'band' || molarBraces) && !gone && !implant;
    band.position.set(0, h * 0.45 - mid, 0);
    band.scale.set((bounds[1][0] - bounds[0][0]) / 9.6, 0.45, (bounds[1][2] - bounds[0][2]) / 9.6);
    render();
  };
  /** The surface a point of the crown falls in, in the surface view (same cut as the shader). */
  const zoneAt = (p: import('three').Vector3): string => {
    const e = shared.uExt.value, a = (p.x - e.z) * mesial / e.x, b = (p.z - e.w) / e.y;
    if (Math.max(Math.abs(a), Math.abs(b)) < 0.5) return 'occlusal';
    return Math.abs(a) > Math.abs(b) ? (a > 0 ? 'mesial' : 'distal') : b > 0 ? 'buccal' : 'lingual';
  };
  /** Surface view: only the crown, seen from the biting side and zoomed to fill the frame; mesial toward the chart's midline. */
  const setTop = (on: boolean) => { top = on; if (!on) { camera.fov = 35; camera.up.set(0, 1, 0); camera.position.set(0, 0, 9.6); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); } };
  const frameTop = (no: number) => {
    const mid = (ymin + ymax) / 2, e = shared.uExt.value, s = group.scale.x;
    group.updateMatrixWorld(true);
    const L = (x: number, y: number, z: number) => group.localToWorld(new T.Vector3(x, y - mid, z));
    const c = L(e.z, h * 0.8, e.w), out = L(e.z, h * 0.8 + 1, e.w).sub(c).normalize(), zl = L(e.z, h * 0.8, e.w + 1).sub(c).normalize();
    const half = Math.max(e.x, e.y) * s * 1.1, D = half / Math.tan((22 / 2) * Math.PI / 180) + h * s;
    camera.fov = 22; camera.updateProjectionMatrix();
    camera.position.copy(c).addScaledVector(out, D);
    const midlineRight = [1, 4, 5, 8].includes(Math.floor(no / 10));
    for (const sign of [1, -1]) {
      camera.up.copy(zl).multiplyScalar(sign); camera.lookAt(c); camera.updateMatrixWorld(true);
      const m = L(e.z + mesial * e.x, h * 0.8, e.w).project(camera);
      if ((m.x > 0) === midlineRight) break;
    }
  };
  /** Puts every part where the explode amount (0 = whole tooth, 1 = fully apart) asks. */
  const layout = () => {
    const mid = (ymin + ymax) / 2, e = explode;
    const dir: Record<string, [number, number, number]> = { occlusal: [0, 1, 0], buccal: [0, 0, 1], lingual: [0, 0, -1], mesial: [mesial, 0, 0], distal: [-mesial, 0, 0] };
    pieces.forEach((m) => { const d = dir[m.userData['zone'] as string]; m.position.set(d[0] * 5 * e, d[1] * 5 * e - mid, d[2] * 5 * e); });
    rootMeshes.forEach((m, i) => {
      const r = roots.find((q) => q.slot === i + 1); const tx = r?.tip[0] ?? 0, tz = r?.tip[2] ?? 0, l = Math.hypot(tx, tz) || 1;
      m.position.set((tx / l) * 3.5 * e * (roots.length > 1 ? 1 : 0), -4 * e - mid, (tz / l) * 3.5 * e * (roots.length > 1 ? 1 : 0));
    });
  };
  const setExplode = (v: number) => { explode = v; camera.position.setLength(9 + 6 * v); if (last) apply(last[0], last[1], last[2]); else render(); };
  /** Where each area's name label sits, in world space (null when that part is not shown). */
  const anchors = (): Record<string, import('three').Vector3 | null> => {
    const mid = (ymin + ymax) / 2, lo = bounds[0], hi = bounds[1];
    const near = mesial > 0 ? hi[0] + 1 : lo[0] - 1, far = mesial > 0 ? lo[0] - 1 : hi[0] + 1;
    const crownShown = crown.visible || pieces[0].visible || shell.visible || prep.visible, rootShown = rootParts.some((m) => m.visible);
    const at = (x: number, y: number, z: number, on: boolean) => (on ? group.localToWorld(new T.Vector3(x, y - mid, z)) : null);
    const out: Record<string, import('three').Vector3 | null> = {
      occlusal: at(0, h + 0.8 + 5 * explode, 0, crownShown), buccal: at(0, h * 0.55, hi[2] + 1 + 5 * explode, crownShown), lingual: at(0, h * 0.55, lo[2] - 1 - 5 * explode, crownShown),
      mesial: at(near + mesial * 5 * explode, h * 0.55, 0, crownShown), distal: at(far - mesial * 5 * explode, h * 0.55, 0, crownShown),
      cervical: at(far, h * 0.05, 0, crownShown),
    };
    for (const r of roots) {
      const l = Math.hypot(r.tip[0], r.tip[2]) || 1, sp = roots.length > 1 ? 3.5 * explode : 0;
      out[`root-${r.slot}`] = at(r.tip[0] + (r.tip[0] / l) * sp, r.tip[1] * 0.55 - 4 * explode, r.tip[2] + (r.tip[2] / l) * sp, rootShown && rootParts[r.slot].visible);
    }
    return out;
  };
  /** The roots of the shown tooth, in slot order, with their anatomical key (mb, db, p, m, d, b, l, single). */
  const rootList = () => roots.map((r) => ({ slot: r.slot, key: r.key })).sort((a, b) => a.slot - b.slot);
  /** The area under a pointer: a crown surface (from the hit face's own normal), the neck, one root, or the root tip. */
  const ray = new T.Raycaster();
  const areaAt = (ndc: import('three').Vector2): string | null => {
    ray.setFromCamera(ndc, camera);
    if (top) { const t = [crown, shell].filter((m) => m.visible); const hit = ray.intersectObjects(t, false)[0]; return hit ? zoneAt(hit.object.worldToLocal(hit.point.clone())) : null; }
    const targets = [crown, shell, ...pieces, ...rootParts].filter((m) => m.visible && !m.userData['ghost']);
    const hit = ray.intersectObjects(targets, false)[0];
    if (!hit?.face) return null;
    const p = hit.object.worldToLocal(hit.point.clone());
    const k = rootMeshes.findIndex((m) => m === hit.object);
    if (hit.object.userData['zone']) return hit.object.userData['zone'] as string;
    if (hit.object === trunk) return null; // the shared trunk is not a horn
    if (k >= 0) return `root-${k + 1}`;
    const n = hit.face.normal; // already in the tooth's own frame: +y toward the bite, +z toward the lip or cheek
    if (p.y < h * 0.12) return 'cervical';
    return n.y > 0.7 ? 'occlusal' : n.z > 0.5 ? 'buccal' : n.z < -0.5 ? 'lingual' : p.x * mesial > 0 ? 'mesial' : 'distal';
  };
  /** Lights the hovered area softly and the selected ones strongly. */
  const setHighlight = (hover: string | null, selected: readonly string[]) => {
    const lv = (id: string) => (selected.includes(id) ? 1 : id === hover ? 0.5 : 0);
    shared.uHi.value = ZONES.map(lv);
    shared.uHiCerv.value = lv('cervical');
    for (let k = 1; k <= 3; k++) his[k].value = lv(`root-${k}`); // each horn is its own area
    render();
  };
  /** The tooth's frame, for anything drawn around it: lib units (mm), CEJ at 0, +y to the bite, +z to the lip, `mesial` = ±1 along x. */
  const info = () => ({ mid: (ymin + ymax) / 2, ymin, ymax, bounds, mesial });
  return { info, setTop, frameTop, setExplode, renderer, scene, camera, group, tooth: crown, mesial: () => mesial, anchors, rootList, areaAt, setHighlight, render, apply, dispose: () => { for (const g of cache.values()) g.dispose(); } };
}
