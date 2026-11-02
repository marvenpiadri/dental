import type { ToothRecord } from './engine/chart';

export type Three = typeof import('three');
const ZONES = ['mesial', 'distal', 'buccal', 'lingual', 'occlusal'] as const;
// 0 clean, 1 caries, 2 amalgam, 3 composite, 4 other restoration
const CODE = (t: ToothRecord, z: string): number => {
  if (t.fillingSurfaces.has(z)) { const m = String(t.fillingSurfaceMaterials.get(z) ?? t.fillingMaterial); return m.includes('amalgam') ? 2 : m.includes('composite') ? 3 : 4; }
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
const FRAG = `uniform float uCode[5]; uniform float uSev[5]; uniform float uAlpha; uniform float uCutY; uniform float uMode; uniform vec3 uRestCol; uniform float uRestSpec; uniform float uLeak;
uniform float uHi[5]; uniform float uHiCerv; uniform float uCervical; uniform float uDisc; uniform float uSeal; uniform float uCalc; uniform float uRootCar; uniform vec3 uBase;
varying vec3 vP; varying vec3 vN; varying vec4 vA; varying vec4 vB;
float hash(vec2 q){ return fract(sin(dot(floor(q), vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec3 p = vP;
  if (p.y > uCutY || p.y < 0.015) discard;         // worn or broken crown; the flat cap cut at the neck is never seen
  float w[5]; w[0] = vA.x; w[1] = vA.y; w[2] = vA.z; w[3] = vA.w; w[4] = vB.x;
  if (uMode == 2.0 && w[2] < 0.5) discard;          // veneer: lip side only
  if (uMode == 3.0 && w[4] < 0.5) discard;          // inlay / onlay: biting face only
  vec3 col = uBase; float spec = 0.25; float shin = 24.0;
  if (uMode >= 1.0) { // a restoration shell
    col = uRestCol; spec = uRestSpec; shin = 70.0 * uRestSpec + 10.0;
    col = mix(col, vec3(0.1, 0.06, 0.03), uLeak * smoothstep(0.35, 0.9, vB.y) * 0.85);
  } else {
    if (uDisc == 1.0) col = mix(col, vec3(0.62, 0.6, 0.45), 0.55);
    if (uDisc == 2.0) col = mix(col, vec3(1.0), 0.5 * step(0.7, hash(p.xy * 5.0 + p.z * 3.0)));
    if (uDisc == 3.0) col = mix(col, vec3(0.45, 0.45, 0.48), 0.6);
    if (uDisc == 4.0) col = mix(col, vec3(0.5, 0.33, 0.15), 0.35 + 0.2 * hash(p.xz * 6.0));
    if (uDisc == 5.0) col = mix(col, vec3(0.7, 0.55, 0.4), 0.4);
    if (uSeal > 0.5) { col = mix(col, vec3(0.75, 0.85, 0.95), 0.5 * w[4]); }
    for (int i = 0; i < 5; i++) {
      float c = uCode[i];
      if (c == 1.0) { float a = (0.55 + 0.4 * uSev[i] / 6.0 - 0.15 * hash(p.xz * 6.0)) * smoothstep(0.1, 0.7, w[i]); col = mix(col, vec3(0.16, 0.08, 0.04), a); spec = mix(spec, 0.05, a); }
      else if (c > 1.0) {
        float a = smoothstep(0.42, 0.58, w[i]);
        vec3 fc = c == 2.0 ? vec3(0.55, 0.57, 0.6) : c == 3.0 ? vec3(0.96, 0.94, 0.86) : vec3(0.85, 0.7, 0.3);
        col = mix(col, fc, a); spec = mix(spec, c == 2.0 ? 1.0 : c == 3.0 ? 0.1 : 0.8, a); shin = mix(shin, c == 2.0 ? 90.0 : 12.0, a);
      }
    }
    if (uCervical > 0.5) col = mix(col, vec3(0.45, 0.38, 0.28), 0.6 * smoothstep(0.55, 0.9, vB.y));
    col = mix(col, vec3(0.78, 0.66, 0.4), uCalc * smoothstep(0.5, 0.85, vB.y) * 0.8);
  }
  float sel = 0.0, hov = 0.0;
  for (int i = 0; i < 5; i++) { sel += w[i] * step(0.9, uHi[i]); hov += w[i] * step(0.4, uHi[i]) * (1.0 - step(0.9, uHi[i])); }
  float neck = smoothstep(0.4, 0.9, vB.y);
  sel += uHiCerv * step(0.9, uHiCerv) * neck; hov += uHiCerv * (1.0 - step(0.9, uHiCerv)) * neck * 2.0;
  col = mix(col, vec3(0.13, 0.83, 0.93), clamp(hov, 0.0, 1.0) * 0.55);   // hover: cyan
  col = mix(col, vec3(1.0, 0.62, 0.04), clamp(sel, 0.0, 1.0) * 0.78);    // selected: amber
  if (!gl_FrontFacing) col = vec3(0.55, 0.45, 0.35);
  vec3 N = normalize(vN); vec3 L = normalize(vec3(0.4, 0.8, 0.6)); vec3 V = vec3(0.0, 0.0, 1.0);
  float d = abs(dot(N, L)) * 0.6 + 0.5; float s = pow(max(dot(reflect(-L, N), V), 0.0), shin) * spec;
  gl_FragColor = vec4(col * d + vec3(s), uAlpha);
}`;
const ROOT_FRAG = `uniform float uAlpha; uniform float uCalc; uniform float uRootCar; uniform float uHiSel; uniform float uHiCerv; uniform float uHiApical; uniform float uRootLen; uniform float uBroken; varying vec3 vP; varying vec3 vN;
void main(){
  if (vP.y > -0.015) discard;
  vec3 col = vec3(0.85, 0.77, 0.62);
  if (uCalc > 0.5) col = mix(col, vec3(0.78, 0.66, 0.4), 0.8 * smoothstep(-2.4, -1.2, vP.y));
  if (uRootCar > 0.0) col = mix(col, uRootCar > 1.5 ? vec3(0.12, 0.07, 0.04) : vec3(0.42, 0.3, 0.15), 0.8 * smoothstep(-6.0, -4.5, vP.y));
  float neck = 1.0 - smoothstep(0.8, 2.4, -vP.y);
  float tip = smoothstep(0.62, 0.78, vP.y / uRootLen);
  float sel = max(step(0.9, uHiSel), max(step(0.9, uHiCerv) * neck, step(0.9, uHiApical) * tip));
  float hov = max(step(0.4, uHiSel) * (1.0 - step(0.9, uHiSel)), max(step(0.4, uHiCerv) * (1.0 - step(0.9, uHiCerv)) * neck, step(0.4, uHiApical) * (1.0 - step(0.9, uHiApical)) * tip));
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

  const shared = { uAlpha: { value: 1 }, uCalc: { value: 0 }, uRootCar: { value: 0 }, uHi: { value: [0, 0, 0, 0, 0] }, uHiCerv: { value: 0 }, uHiApical: { value: 0 }, uRootLen: { value: -12 } };
  const U = () => ({ ...shared, uCode: { value: [0, 0, 0, 0, 0] }, uSev: { value: [0, 0, 0, 0, 0] }, uCutY: { value: 99 }, uMode: { value: 0 }, uRestCol: { value: new T.Vector3(1, 1, 1) }, uRestSpec: { value: 0.3 },
    uLeak: { value: 0 }, uCervical: { value: 0 }, uDisc: { value: 0 }, uSeal: { value: 0 }, uBase: { value: new T.Vector3(0.93, 0.91, 0.85) } });
  const crownU = U(), shellU = U(); shellU.uMode.value = 1;
  const mk = (u: ReturnType<typeof U>) => new T.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: FRAG, transparent: true, side: T.DoubleSide });
  const crown = new T.Mesh(undefined, mk(crownU));
  const prep = new T.Mesh(undefined, mk(crownU));
  const shell = new T.Mesh(undefined, mk(shellU));
  const rootVert = 'varying vec3 vP; varying vec3 vN; void main(){ vP = position; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
  const rootMat = (hi: { value: number }, broken: { value: number }) => new T.ShaderMaterial({ uniforms: { ...shared, uHiSel: hi, uBroken: broken }, vertexShader: rootVert, fragmentShader: ROOT_FRAG, transparent: true, side: T.DoubleSide });
  const his = [{ value: 0 }, { value: 0 }, { value: 0 }, { value: 0 }];   // [0] the trunk (never selected on its own), [1..3] the three root slots
  const brk = [{ value: 0 }, { value: 0 }, { value: 0 }, { value: 0 }];
  const trunk = new T.Mesh(undefined, rootMat(his[0], brk[0]));
  const rootMeshes = [1, 2, 3].map((k) => new T.Mesh(undefined, rootMat(his[k], brk[k])));
  const rootParts = [trunk, ...rootMeshes];
  const empty = new T.BufferGeometry();
  const pulpMat = new T.MeshStandardMaterial({ color: 0xd9626b, roughness: 0.5, transparent: true, opacity: 0.9 });
  const pulp = new T.Mesh(undefined, pulpMat);
  const steel = new T.MeshStandardMaterial({ color: 0xb4bcc4, metalness: 0.3, roughness: 0.4 });
  const gold = new T.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.3, roughness: 0.4 });
  const hw = (id: string, m = steel) => { const mesh = new T.Mesh(geometry(id) ?? undefined, m); mesh.visible = false; return mesh; };
  const fixture = hw('hw-implant-fixture'), abutment = hw('hw-abutment'), healing = hw('hw-healing-cap', gold), cover = hw('hw-cover-screw'), bracket = hw('hw-bracket'), band = hw('hw-band');
  const lesion = new T.Mesh(new T.SphereGeometry(1, 20, 14), new T.MeshStandardMaterial({ color: 0x5a1e2a, transparent: true, opacity: 0.55, roughness: 0.6 }));
  const group = new T.Group(); // the invisible container: pose and visibility live here, the meshes inside only swap
  group.add(crown, prep, shell, trunk, ...rootMeshes, pulp, fixture, abutment, healing, cover, bracket, band, lesion);
  scene.add(group, new T.AmbientLight(0xffffff, 0.8), new T.DirectionalLight(0xffffff, 1.5));

  let roots: { slot: number; key: string; tip: number[]; id: string; broken: string }[] = [];
  let shownFdi = 0, h = 10, ymin = -12, ymax = 10, mesial = 1, bounds: number[][] = [[0, 0, 0], [0, 0, 0]];
  const apply = (t: ToothRecord, no: number, showPulp: boolean) => {
    const sel = String((t as { toothSelection?: string }).toothSelection ?? '');
    const gone = sel.includes('no-tooth'), implant = sel === 'implant';
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
      onNewTooth();
      shownFdi = no;
    }
    const mid = (ymin + ymax) / 2;
    const R = t as unknown as Record<string, string | boolean | Set<string>>;
    const str = (k: string) => String(R[k] ?? '');
    crownU.uCode.value = ZONES.map((z) => CODE(t, z));
    crownU.uSev.value = ZONES.map((z) => t.cariesSeverity.get(z) ?? 0);
    // How much of the crown is left.
    const sub = str('toothSubstrate');
    let cut = 99;
    const cutBy = (d: number) => { cut = Math.min(cut, h - d); };
    if (R['brokenIncisal'] || R['brokenMesial'] || R['brokenDistal']) cutBy(h * 0.2);
    if (sub === 'broken') cutBy(h * 0.5);
    if (str('wearEdge') !== 'none') cutBy(h * 0.07);
    crownU.uCutY.value = cut;
    crownU.uCervical.value = str('wearCervical') !== 'none' ? 1 : 0;
    crownU.uDisc.value = Math.max(0, ['none', 'tetracycline', 'fluorosis', 'nonvital', 'extrinsic', 'other'].indexOf(str('discoloration')));
    crownU.uSeal.value = R['fissureSealing'] ? 1 : 0;
    shared.uCalc.value = R['calculus'] ? 1 : 0;
    shared.uRootCar.value = ({ none: 0, arrested: 1, active: 2, 'active-cavitated': 2 } as Record<string, number>)[str('rootCaries')] ?? 0;
    // Restorations: a crown/bridge replaces the crown by the library's shell; veneer and inlay/onlay are patches of it.
    const rt = str('restorationType'), rm = str('restorationMaterial');
    const m = MAT[rm] ?? MAT['none'];
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
    const ghost = gone && !implant; // an extracted tooth stays as a faint outline
    crown.userData['ghost'] = ghost;
    const glass = ghost || (pulpOn && !(implant && hasRest));
    shared.uAlpha.value = ghost ? 0.14 : glass ? 0.35 : 1;
    for (const mesh of [crown, ...rootParts, prep, shell]) (mesh.material as import('three').ShaderMaterial).depthWrite = !glass;
    pulp.renderOrder = 1;
    // Presence and parts.
    const radix = sub === 'radix', stump = sub === 'crownprep';
    const naturalCrown = !implant && !radix && !stump && !(fullCover);
    crown.visible = (naturalCrown && !gone) || ghost;
    prep.visible = !implant && stump && !gone;
    shell.visible = hasRest && !gone && (!implant ? true : fullCover);
    const rootsOn = !implant && (!gone || ghost);
    trunk.visible = rootsOn && trunk.geometry !== empty;
    rootMeshes.forEach((m, i) => {
      const r = roots.find((q) => q.slot === i + 1), br = !!r && !!R[`brokenRoot${i + 1}`] && !!data.parts.get(r.broken);
      m.visible = rootsOn && !!r;
      if (r) m.geometry = geometry(br ? r.broken : r.id)!;
      brk[i + 1].value = br ? 1 : 0;
    });
    pulp.visible = !implant && !gone && pulpOn;
    if (ghost) { crown.visible = true; shell.visible = false; }
    // Implant hardware, all positioned at the neck.
    const prosthesis = str('prosthesis');
    fixture.visible = implant;
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
    band.visible = str('orthoAppliance') === 'band' && !gone && !implant;
    band.position.set(0, h * 0.25 - mid, 0);
    band.scale.set((bounds[1][0] - bounds[0][0]) / 9.6, 1, (bounds[1][2] - bounds[0][2]) / 9.6);
    render();
  };
  /** Where each area's name label sits, in world space (null when that part is not shown). */
  const anchors = (): Record<string, import('three').Vector3 | null> => {
    const mid = (ymin + ymax) / 2, lo = bounds[0], hi = bounds[1];
    const near = mesial > 0 ? hi[0] + 1 : lo[0] - 1, far = mesial > 0 ? lo[0] - 1 : hi[0] + 1;
    const crownShown = crown.visible || shell.visible || prep.visible, rootShown = rootParts.some((m) => m.visible);
    const at = (x: number, y: number, z: number, on: boolean) => (on ? group.localToWorld(new T.Vector3(x, y - mid, z)) : null);
    const out: Record<string, import('three').Vector3 | null> = {
      occlusal: at(0, h + 0.8, 0, crownShown), buccal: at(0, h * 0.55, hi[2] + 1, crownShown), lingual: at(0, h * 0.55, lo[2] - 1, crownShown),
      mesial: at(near, h * 0.55, 0, crownShown), distal: at(far, h * 0.55, 0, crownShown),
      cervical: at(far, 0, 0, rootShown || crownShown), apical: at(0, ymin - 0.9, 0, rootShown),
    };
    for (const r of roots) out[`root-${r.slot}`] = at(r.tip[0], r.tip[1] * 0.55, r.tip[2], rootShown && rootParts[r.slot].visible);
    return out;
  };
  /** The roots of the shown tooth, in slot order, with their anatomical key (mb, db, p, m, d, b, l, single). */
  const rootList = () => roots.map((r) => ({ slot: r.slot, key: r.key })).sort((a, b) => a.slot - b.slot);
  /** The area under a pointer: a crown surface (from the hit face's own normal), the neck, one root, or the root tip. */
  const ray = new T.Raycaster();
  const areaAt = (ndc: import('three').Vector2): string | null => {
    ray.setFromCamera(ndc, camera);
    const targets = [crown, shell, ...rootParts].filter((m) => m.visible && !m.userData['ghost']);
    const hit = ray.intersectObjects(targets, false)[0];
    if (!hit?.face) return null;
    const p = hit.object.worldToLocal(hit.point.clone());
    const k = rootMeshes.findIndex((m) => m === hit.object);
    if (hit.object === trunk) return 'cervical';
    if (k >= 0) return p.y > -1.6 ? 'cervical' : p.y / (roots.find((q) => q.slot === k + 1)?.tip[1] ?? ymin) > 0.8 ? 'apical' : `root-${k + 1}`;
    const n = hit.face.normal; // already in the tooth's own frame: +y toward the bite, +z toward the lip or cheek
    if (p.y < h * 0.12) return 'cervical';
    return n.y > 0.7 ? 'occlusal' : n.z > 0.5 ? 'buccal' : n.z < -0.5 ? 'lingual' : p.x * mesial > 0 ? 'mesial' : 'distal';
  };
  /** Lights the hovered area softly and the selected ones strongly. */
  const setHighlight = (hover: string | null, selected: readonly string[]) => {
    const lv = (id: string) => (selected.includes(id) ? 1 : id === hover ? 0.5 : 0);
    shared.uHi.value = ZONES.map(lv);
    shared.uHiCerv.value = lv('cervical'); shared.uHiApical.value = lv('apical');
    for (let k = 1; k <= 3; k++) his[k].value = lv(`root-${k}`);
    render();
  };
  return { scene, camera, group, tooth: crown, mesial: () => mesial, anchors, rootList, areaAt, setHighlight, render, apply, dispose: () => { for (const g of cache.values()) g.dispose(); } };
}
