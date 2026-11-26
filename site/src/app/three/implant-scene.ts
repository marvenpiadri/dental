import type * as T from 'three';

/** Crown, screw, abutment, implant: top to bottom, the order the parts are named in the copy. */
export const IMPLANT_PARTS = ['crown', 'screw', 'abutment', 'implant'] as const;
const LOOK: Record<(typeof IMPLANT_PARTS)[number], { color: number; metalness: number; roughness: number }> = {
  crown: { color: 0xf1ede4, metalness: 0, roughness: 0.32 },
  screw: { color: 0x59616c, metalness: 1, roughness: 0.3 },
  abutment: { color: 0xc8b07a, metalness: 1, roughness: 0.28 },
  implant: { color: 0xa3acb5, metalness: 1, roughness: 0.34 },
};

/**
 * One implant tooth from implants.glb (lower right first molar, FDI 46) taken apart along its own axis.
 * The distances are measured from the parts' boxes, so each piece clears the one it sits in.
 */
export class ImplantScene {
  private renderer!: T.WebGLRenderer; private scene!: T.Scene; private camera!: T.PerspectiveCamera; private spin!: T.Group; private holder!: T.Group;
  private parts: { name: string; mesh: T.Mesh; base: T.Vector3; off: number; mat: T.MeshPhysicalMaterial }[] = [];
  private unit!: T.Vector3; private midA = 0; private midB = 0; private t = 0; private sel = -1; private az = 0.6; private vel = 0; private dragging = false; private lastX = 0;
  private raf = 0; private running = false; private visible = true; private cleanup: (() => void)[] = [];

  static async create(canvas: HTMLCanvasElement, fdi = '46'): Promise<ImplantScene> {
    const [three, env, gl, mo] = await Promise.all([import('three'), import('three/examples/jsm/environments/RoomEnvironment.js'), import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/libs/meshopt_decoder.module.js')]);
    const loader = new gl.GLTFLoader(); loader.setMeshoptDecoder(mo.MeshoptDecoder);
    const gltf = await loader.loadAsync('models/implants.glb');
    const node = gltf.scene.getObjectByName(`tooth-${fdi}`);
    if (!node) throw new Error('implant tooth missing');
    const s = new ImplantScene(); s.build(three, env.RoomEnvironment, node, canvas, fdi); return s;
  }

  private build(T3: typeof T, RoomEnvironment: new () => T.Scene, node: T.Object3D, canvas: HTMLCanvasElement, fdi: string): void {
    this.renderer = new T3.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); this.renderer.toneMapping = T3.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 0.95;
    this.scene = new T3.Scene(); const pm = new T3.PMREMGenerator(this.renderer); this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
    const key = new T3.DirectionalLight(0xffffff, 1.3); key.position.set(2, 3, 4); this.scene.add(key);
    this.camera = new T3.PerspectiveCamera(24, 1, 1, 5000);

    const tooth = node.clone(true); tooth.position.set(0, 0, 0); tooth.quaternion.identity(); tooth.scale.set(1, 1, 1); tooth.updateMatrixWorld(true);
    const byName = (n: string) => tooth.getObjectByName(`${n}-${fdi}`) as T.Mesh | undefined;
    const meshes = IMPLANT_PARTS.map((n) => byName(n));
    if (meshes.some((m) => !m?.isMesh)) throw new Error('implant parts missing');
    const box = (m: T.Mesh) => new T3.Box3().setFromObject(m);
    const all = new T3.Box3(); meshes.forEach((m) => all.union(box(m!)));
    const ext = all.getSize(new T3.Vector3()), axes = [new T3.Vector3(1, 0, 0), new T3.Vector3(0, 1, 0), new T3.Vector3(0, 0, 1)];
    const li = ext.toArray().indexOf(Math.max(...ext.toArray()));
    const cc = box(meshes[0]!).getCenter(new T3.Vector3()), ci = box(meshes[3]!).getCenter(new T3.Vector3());
    const up = axes[li].clone().multiplyScalar(Math.sign(cc.getComponent(li) - ci.getComponent(li)) || 1);
    const a = axes[(li + 1) % 3].clone(), c = a.clone().cross(up);
    this.holder = new T3.Group(); this.holder.add(tooth);
    this.holder.setRotationFromMatrix(new T3.Matrix4().makeBasis(a, up, c).invert());
    this.spin = new T3.Group(); this.spin.add(this.holder); this.scene.add(this.spin); this.holder.updateMatrixWorld(true);

    // Extent of each part along the stacking axis, in the standing-up frame.
    const span = (m: T.Mesh) => { const b = new T3.Box3().setFromObject(m); return [b.min.y, b.max.y] as const; };
    const [crown, screw, abut, imp] = meshes.map((m) => span(m!));
    const H = imp[1] - imp[0], gap = H * 0.35;
    const offAbut = gap, offScrew = offAbut + Math.max(0, abut[1] - screw[0]) + gap, offCrown = offScrew + Math.max(0, screw[1] - crown[0]) + gap;
    const offs = [offCrown, offScrew, offAbut, 0];
    this.unit = new T3.Vector3(0, 1, 0).transformDirection(new T3.Matrix4().copy(tooth.matrixWorld).invert()); // +y of the stand, in the tooth's own frame
    const worldToTooth = new T3.Matrix4().copy(tooth.matrixWorld).invert();
    const stepLocal = new T3.Vector3(0, 1, 0).applyMatrix4(this.holder.matrixWorld.clone().invert()); // a unit in stand space expressed in holder space
    void worldToTooth; this.unit.copy(stepLocal.sub(new T3.Vector3(0, 0, 0).applyMatrix4(this.holder.matrixWorld.clone().invert())));
    this.parts = meshes.map((m, i) => {
      const src = m!.material as T.Material, base = m!.position.clone(), look = LOOK[IMPLANT_PARTS[i]];
      const mat = new T3.MeshPhysicalMaterial({ ...look, clearcoat: i === 0 ? 0.6 : 0.1, side: T3.FrontSide }); src.dispose(); m!.material = mat;
      return { name: IMPLANT_PARTS[i], mesh: m!, base, off: offs[i], mat };
    });
    const whole = new T3.Box3(); this.parts.forEach((p) => whole.union(new T3.Box3().setFromObject(p.mesh)));
    this.midA = (whole.min.y + whole.max.y) / 2; this.midB = this.midA + offCrown / 2;
    const exploded = (whole.max.y - whole.min.y) + offCrown, width = Math.max(ext.x, ext.y, ext.z) * 0; void width;
    this.camera.position.set(0, exploded * 0.12, (exploded * 1.15) / 2 / Math.tan((24 / 2) * Math.PI / 180) * 1.1); this.camera.lookAt(0, 0, 0);
    this.setExplode(0);

    const ro = new ResizeObserver(() => this.resize()); ro.observe(canvas.parentElement ?? canvas); this.cleanup.push(() => ro.disconnect());
    const io = new IntersectionObserver((e) => { this.visible = e[0].isIntersecting; this.kick(); }); io.observe(canvas); this.cleanup.push(() => io.disconnect());
    const host = canvas.parentElement ?? canvas;
    const down = (e: PointerEvent) => { if ((e.target as HTMLElement).closest('button, input, label')) return; this.dragging = true; this.lastX = e.clientX; this.vel = 0; host.setPointerCapture?.(e.pointerId); this.kick(); };
    const move = (e: PointerEvent) => { if (!this.dragging) return; const dx = e.clientX - this.lastX; this.lastX = e.clientX; this.az += dx * 0.008; this.vel = dx * 0.008; this.kick(); };
    const up2 = () => { this.dragging = false; };
    host.addEventListener('pointerdown', down); host.addEventListener('pointermove', move); window.addEventListener('pointerup', up2);
    this.cleanup.push(() => { host.removeEventListener('pointerdown', down); host.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up2); });
    this.resize();
  }

  /** 0 = assembled, 1 = fully apart. */
  setExplode(t: number): void {
    this.t = Math.min(1, Math.max(0, t));
    for (const p of this.parts) p.mesh.position.copy(p.base).addScaledVector(this.unit, p.off * this.t);
    this.holder.position.set(0, 0, 0); this.holder.updateMatrixWorld(true);
    this.holder.position.y = -(this.midA + (this.midB - this.midA) * this.t); this.kick();
  }

  /** Isolate one part (index into IMPLANT_PARTS) or show all with -1. */
  select(i: number): void {
    this.sel = i;
    this.parts.forEach((p, k) => { const dim = i >= 0 && k !== i; p.mat.transparent = dim; p.mat.opacity = dim ? 0.14 : 1; p.mat.depthWrite = !dim; p.mat.needsUpdate = true; });
    this.kick();
  }

  private resize(): void { const el = this.renderer.domElement.parentElement ?? this.renderer.domElement, w = el.clientWidth || 1, h = el.clientHeight || 1; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.kick(); }
  private kick(): void { if (!this.running) { this.running = true; this.raf = requestAnimationFrame(this.frame); } }
  private frame = (): void => {
    if (!this.visible || document.hidden) { this.running = false; return; }
    if (!this.dragging) { this.az += this.vel; this.vel *= 0.92; }
    this.spin.rotation.y = this.az;
    this.renderer.render(this.scene, this.camera);
    if (this.dragging || Math.abs(this.vel) > 1e-4) this.raf = requestAnimationFrame(this.frame); else this.running = false;
  };

  dispose(): void {
    cancelAnimationFrame(this.raf); this.running = false; this.cleanup.forEach((f) => f());
    this.scene.traverse((o) => { const m = o as T.Mesh; m.geometry?.dispose?.(); const mat = m.material as T.Material | undefined; mat?.dispose?.(); });
    this.renderer.dispose();
  }
}
