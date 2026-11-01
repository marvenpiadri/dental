import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, PLATFORM_ID, effect, inject, input, viewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { ToothRecord } from './engine/chart';

export type Three = typeof import('three');
const ZONES = ['mesial', 'distal', 'buccal', 'lingual', 'occlusal'] as const;
// 0 clean, 1 caries, 2 amalgam, 3 composite, 4 other restoration
const CODE = (t: ToothRecord, z: string): number => {
  if (t.fillingSurfaces.has(z)) { const m = String(t.fillingSurfaceMaterials.get(z) ?? t.fillingMaterial); return m.includes('amalgam') ? 2 : m.includes('composite') ? 3 : 4; }
  return t.caries.has('caries-' + z) ? 1 : 0;
};

interface Part { id: string; group: 'tooth' | 'pulp'; fdi: number; positions: number; normals: number; indices: number; vertexCount: number; indexCount: number; axes?: { center: number[]; side: number[]; up: number[]; out: number[] } }
export interface TfData { buf: ArrayBuffer; parts: Part[] }
let tfData: Promise<TfData> | null = null;
/** The ToothFairy3 manifest and mesh buffer (about 8 MB), fetched once and shared by every overlay. */
export const loadTf = (): Promise<TfData> => (tfData ??= Promise.all([fetch('/models/toothfairy/manifest.json').then((r) => r.json()), fetch('/models/toothfairy/toothfairy.bin').then((r) => r.arrayBuffer())])
  .then(([m, buf]) => ({ buf, parts: m.parts as Part[] }))
  .catch((e) => { tfData = null; throw e; }));

const VERT = `varying vec3 vP; varying vec3 vN; void main(){ vP = position; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
// Zone comes from the local position: top cap = occlusal, otherwise the dominant horizontal axis. Each zone's code drives the look.
const FRAG = `uniform float uCode[5]; uniform float uSev[5]; uniform float uMesial; uniform float uTop; uniform float uCrown; uniform float uAlpha;
uniform float uCut; uniform float uRootCut; uniform float uRest; uniform vec3 uRestCol; uniform float uRestSpec; uniform float uLeak; uniform float uCalc; uniform float uSeal; uniform float uRootCar; uniform float uDisc; uniform float uCervical;
varying vec3 vP; varying vec3 vN;
float pick(float a[5], int i){ if(i==0) return a[0]; if(i==1) return a[1]; if(i==2) return a[2]; if(i==3) return a[3]; return a[4]; }
float hash(vec2 q){ return fract(sin(dot(floor(q), vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec3 p = vP; float depth = uTop - p.y; // distance down from the biting edge
  if (depth < uCut) discard;                    // worn, broken or prepared crown
  if (uRootCut > 0.5 && depth > uCrown) discard; // implant crown: no natural root
  vec3 enamel = vec3(0.93, 0.91, 0.85), root = vec3(0.85, 0.77, 0.62);
  vec3 col = mix(enamel, root, smoothstep(uCrown * 0.95, uCrown * 1.12, depth));
  float spec = 0.25; float shin = 24.0;
  if (depth < uCrown) {
    int z = depth < uCrown * 0.3 ? 4 : (abs(p.x) > abs(p.z) ? (p.x * uMesial > 0.0 ? 0 : 1) : (p.z > 0.0 ? 2 : 3));
    if (uDisc == 1.0) col = mix(col, vec3(0.62, 0.6, 0.45), 0.55);              // tetracycline
    if (uDisc == 2.0) col = mix(col, vec3(1.0), 0.5 * step(0.7, hash(p.xy * 5.0 + p.z * 3.0))); // fluorosis flecks
    if (uDisc == 3.0) col = mix(col, vec3(0.45, 0.45, 0.48), 0.6);              // non-vital
    if (uDisc == 4.0) col = mix(col, vec3(0.5, 0.33, 0.15), 0.35 + 0.2 * hash(p.xz * 6.0)); // extrinsic
    if (uDisc == 5.0) col = mix(col, vec3(0.7, 0.55, 0.4), 0.4);
    float code = pick(uCode, z); float sev = pick(uSev, z);
    if (uSeal > 0.5 && z == 4) { col = mix(col, vec3(0.75, 0.85, 0.95), 0.5); shin = 60.0; spec = 0.6; }
    if (code == 1.0) { col = mix(col, vec3(0.16, 0.08, 0.04), 0.55 + 0.4 * sev / 6.0 - 0.15 * hash(p.xz * 6.0)); spec = 0.05; }
    if (code == 2.0) { col = vec3(0.55, 0.57, 0.6); spec = 1.0; shin = 90.0; }
    if (code == 3.0) { col = vec3(0.96, 0.94, 0.86); spec = 0.1; shin = 8.0; }
    if (code == 4.0) { col = vec3(0.85, 0.7, 0.3); spec = 0.8; shin = 60.0; }
    // Crown work covers the whole crown (a veneer only the lip side; an inlay/onlay only the biting face).
    bool covers = uRest == 1.0 || uRest == 4.0 || (uRest == 2.0 && z == 2) || (uRest == 3.0 && (z == 4 || depth < uCrown * 0.4));
    if (covers) { col = uRestCol; spec = uRestSpec; shin = 70.0 * uRestSpec + 10.0;
      if (uLeak > 0.5 && depth > uCrown * 0.88) col = mix(col, vec3(0.1, 0.06, 0.03), 0.8); }
    if (uCervical > 0.5 && depth > uCrown * 0.82 && depth < uCrown && abs(p.z) > abs(p.x) * 0.4) col = mix(col, vec3(0.45, 0.38, 0.28), 0.6); // cervical notch
  } else {
    if (uRootCar > 0.0 && depth < uCrown * 1.7) col = mix(col, uRootCar > 1.5 ? vec3(0.12, 0.07, 0.04) : vec3(0.42, 0.3, 0.15), 0.8);
  }
  if (uCalc > 0.5 && depth > uCrown * 0.9 && depth < uCrown * 1.2) col = mix(col, vec3(0.78, 0.66, 0.4), 0.75); // calculus at the neck
  if (!gl_FrontFacing) col = vec3(0.55, 0.45, 0.35); // inside of a cut tooth
  vec3 N = normalize(vN); vec3 L = normalize(vec3(0.4, 0.8, 0.6)); vec3 V = vec3(0.0, 0.0, 1.0);
  float d = abs(dot(N, L)) * 0.7 + 0.35; float s = pow(max(dot(reflect(-L, N), V), 0.0), shin) * spec;
  gl_FragColor = vec4(col * d + vec3(s), uAlpha);
}`;


/** The scene for one tooth: groups, meshes and shader. Shared by the live 3D view and the chart's flat snapshots. */
export function makeToothScene(T: Three, data: TfData, renderer: import('three').WebGLRenderer, onNewTooth: () => void = () => undefined) {
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(2.5, 1, 7.5).setLength(9);
    const render = () => renderer.render(scene, camera);
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

    const uniforms = { uCode: { value: [0, 0, 0, 0, 0] }, uSev: { value: [0, 0, 0, 0, 0] }, uMesial: { value: 1 }, uTop: { value: 1 }, uCrown: { value: 1 }, uAlpha: { value: 1 },
      uCut: { value: 0 }, uRootCut: { value: 0 }, uRest: { value: 0 }, uRestCol: { value: new T.Vector3(1, 1, 1) }, uRestSpec: { value: 0.3 }, uLeak: { value: 0 }, uCalc: { value: 0 }, uSeal: { value: 0 }, uRootCar: { value: 0 }, uDisc: { value: 0 }, uCervical: { value: 0 } };
    const mat = new T.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, side: T.DoubleSide });
    const pulpMat = new T.MeshStandardMaterial({ color: 0xd9626b, roughness: 0.5, transparent: true, opacity: 0.9 });
    const tooth = new T.Mesh(undefined, mat), pulp = new T.Mesh(undefined, pulpMat);
    const hardware = new T.Group();
    const steel = new T.MeshStandardMaterial({ color: 0x9aa4ae, metalness: 0.3, roughness: 0.4 });
    const screw = new T.Mesh(new T.CylinderGeometry(0.3, 0.2, 1.9, 24), steel); screw.position.y = -1.3;
    const abut = new T.Mesh(new T.CylinderGeometry(0.22, 0.3, 0.4, 24), steel); abut.position.y = -0.1;
    hardware.add(screw, abut);
    const socket = new T.Mesh(new T.TorusGeometry(1.1, 0.09, 12, 48), new T.MeshBasicMaterial({ color: 0x777777 }));
    socket.add(new T.Mesh(new T.CircleGeometry(1.1, 40), new T.MeshBasicMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.45, side: T.DoubleSide })));
    socket.rotation.x = Math.PI / 2;
    const lesion = new T.Mesh(new T.SphereGeometry(1, 20, 14), new T.MeshStandardMaterial({ color: 0x5a1e2a, transparent: true, opacity: 0.55, roughness: 0.6 }));
    const bracket = new T.Mesh(new T.BoxGeometry(0.5, 0.35, 0.18), steel);
    const group = new T.Group(); // the invisible container: pose and visibility live here, the meshes inside only swap
    group.add(tooth, pulp, hardware, socket, lesion, bracket);
    scene.add(group, new T.AmbientLight(0xffffff, 0.8), new T.DirectionalLight(0xffffff, 1.5));

    const mid = (a: number, b: number) => (a + b) / 2;
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
          onNewTooth();
        }
        group.rotation.z = no < 30 ? Math.PI : 0; // roots up for the upper arch
        shownFdi = no;
      }
      const R = t as unknown as Record<string, string | boolean | Set<string>>;
      const str = (k: string) => String(R[k] ?? '');
      const h = yMax - yMin, crownH = uniforms.uCrown.value;
      uniforms.uCode.value = ZONES.map((z) => CODE(t, z));
      uniforms.uSev.value = ZONES.map((z) => t.cariesSeverity.get(z) ?? 0);
      // Substrate and damage: how much of the crown is left.
      const sub = str('toothSubstrate');
      let cut = 0;
      if (sub === 'radix') cut = crownH; else if (sub === 'crownprep') cut = crownH * 0.4; else if (sub === 'broken') cut = crownH * 0.5;
      if (R['brokenIncisal'] || R['brokenMesial'] || R['brokenDistal']) cut = Math.max(cut, crownH * 0.2);
      if (str('wearEdge') !== 'none') cut = Math.max(cut, crownH * 0.07);
      uniforms.uCut.value = cut;
      uniforms.uCervical.value = str('wearCervical') !== 'none' ? 1 : 0;
      uniforms.uDisc.value = ['none', 'tetracycline', 'fluorosis', 'nonvital', 'extrinsic', 'other'].indexOf(str('discoloration')) || 0;
      // Restoration type and material.
      const rt = str('restorationType'), rm = str('restorationMaterial');
      uniforms.uRest.value = { crown: 1, bridge: 4, veneer: 2, inlay: 3, onlay: 3 }[rt] ?? 0;
      const MAT: Record<string, [number, number, number, number]> = {
        emax: [0.97, 0.95, 0.9, 0.55], zircon: [0.98, 0.97, 0.94, 0.45], gold: [0.9, 0.7, 0.2, 1], metal: [0.62, 0.64, 0.67, 1],
        'metal-ceramic': [0.95, 0.92, 0.85, 0.5], gradia: [0.96, 0.9, 0.78, 0.2], telescope: [0.6, 0.62, 0.65, 1], temporary: [0.93, 0.7, 0.72, 0.1], none: [0.95, 0.93, 0.88, 0.4],
      };
      const m = MAT[rm] ?? MAT['none'];
      (uniforms.uRestCol.value as import('three').Vector3).set(m[0], m[1], m[2]); uniforms.uRestSpec.value = m[3];
      uniforms.uLeak.value = R['crownLeakage'] ? 1 : 0;
      uniforms.uCalc.value = R['calculus'] ? 1 : 0;
      uniforms.uSeal.value = R['fissureSealing'] ? 1 : 0;
      uniforms.uRootCar.value = { none: 0, arrested: 1, active: 2, 'active-cavitated': 2 }[str('rootCaries')] ?? 0;
      // Pulp: shows its diagnosis, or the root filling when the canal is treated.
      const endo = str('endo'), dx = str('pulpDx');
      const treated = endo !== 'none';
      pulpMat.color.set(treated ? (endo === 'endo-metal-pin' ? 0x444a50 : endo === 'endo-medical-filling' ? 0xb48ac8 : endo === 'endo-glass-pin' ? 0x9fd8d0 : 0xe49aa6)
        : dx === 'necrosis' ? 0x3a3a3a : dx === 'irreversible-pulpitis' ? 0xa1101f : dx === 'reversible-pulpitis' ? 0xe8505b : 0xd9626b);
      const pulpOn = showPulp || treated || dx !== 'normal';
      // Apical lesion at the root tip.
      const lesionKind = str('periapicalType') !== 'none' || /abscess|periodontitis/.test(str('apicalDx'));
      const present = !gone && (!implant || (rt !== 'none' && rt !== ''));
      lesion.visible = lesionKind && present && !implant;
      lesion.scale.setScalar(h * (/abscess|cyst/.test(str('periapicalType') + str('apicalDx')) ? 0.06 : 0.035));
      lesion.position.set(0, yMin - mid(yMin, yMax) + h * 0.02, 0);
      // Orthodontic appliance on the lip side of the crown.
      bracket.visible = str('orthoAppliance') !== 'none' && present;
      bracket.scale.setScalar(h * 0.3);
      bracket.position.set(0, yMax - mid(yMin, yMax) - crownH * 0.55, h * 0.18);
      // Presence: natural, extracted, implant (with or without a crown on it).
      const crownOnImplant = implant && rt !== 'none' && rt !== '';
      uniforms.uRootCut.value = crownOnImplant ? 1 : 0;
      const ghost = gone && !implant; // an extracted tooth stays as a faint outline so the gap is still readable and clickable around
      tooth.userData['ghost'] = ghost;
      uniforms.uAlpha.value = ghost ? 0.14 : pulpOn && !crownOnImplant ? 0.35 : 1; mat.depthWrite = !(ghost || (pulpOn && !crownOnImplant)); pulp.renderOrder = 1;
      tooth.visible = ghost || !gone && (!implant || crownOnImplant);
      pulp.visible = tooth.visible && !ghost && pulpOn && !crownOnImplant;
      hardware.visible = implant;
      hardware.position.y = yMax - uniforms.uCrown.value - mid(yMin, yMax);
      hardware.scale.setScalar(1 / scale);
      abut.visible = implant && (str('prosthesis') !== 'none' || crownOnImplant || true);
      socket.visible = false; // the ghost outline replaces the old ring
      render();
    };
    return { scene, camera, group, tooth, uniforms, render, apply, dispose: () => { for (const g of cache.values()) g.dispose(); } };
}
