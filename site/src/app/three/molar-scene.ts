import type * as T from 'three';

/**
 * A lower molar with its inner anatomy. The outer shell is cut away by a plane the visitor moves,
 * revealing the dentin and the pulp. Source model: free download (author and licence to be confirmed, see tools/implants/README.md).
 */
export class MolarScene {
  private renderer!: T.WebGLRenderer; private scene!: T.Scene; private camera!: T.PerspectiveCamera;
  private spin!: T.Group; private holder!: T.Group;
  private shell!: T.Material; private cutLocal!: T.Plane; private cutWorld!: T.Plane; private sideLocal!: T.Plane; private sideWorld!: T.Plane; private stripLocal: T.Plane[] = []; private stripWorld: T.Plane[] = [];
  private zTop = 0; private zMid = 0; private cutT = 0; private az = 0.5; private vel = 0; private dragging = false; private lastX = 0;
  private raf = 0; private running = false; private visible = true; private cleanup: (() => void)[] = [];

  static async create(canvas: HTMLCanvasElement, reduced: boolean): Promise<MolarScene> {
    const [three, env, gl, mo] = await Promise.all([import('three'), import('three/examples/jsm/environments/RoomEnvironment.js'), import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/libs/meshopt_decoder.module.js')]);
    const loader = new gl.GLTFLoader(); loader.setMeshoptDecoder(mo.MeshoptDecoder);
    const gltf = await loader.loadAsync('models/molar.glb');
    const s = new MolarScene(); s.build(three, env.RoomEnvironment, gltf.scene, canvas, reduced); return s;
  }

  private build(T3: typeof T, RoomEnvironment: new () => T.Scene, model: T.Object3D, canvas: HTMLCanvasElement, reduced: boolean): void {
    this.renderer = new T3.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); this.renderer.toneMapping = T3.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 0.9; this.renderer.localClippingEnabled = true;
    this.scene = new T3.Scene(); const pm = new T3.PMREMGenerator(this.renderer); this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
    const key = new T3.DirectionalLight(0xffffff, 1.4); key.position.set(2, 3, 4); this.scene.add(key);
    this.camera = new T3.PerspectiveCamera(24, 1, 1, 5000);
    const byMat = new Map<string, T.Mesh>(); model.updateMatrixWorld(true);
    model.traverse((o) => { const m = o as T.Mesh; if (m.isMesh) byMat.set((m.material as T.Material).name, m); });
    const tooth = byMat.get('Tooth'), inner = byMat.get('Inner_Tooth'), veins = byMat.get('Veins'), gums = byMat.get('Gums');
    if (!tooth || !inner) throw new Error('molar parts missing');
    if (gums) gums.visible = false;
    const size = (m: T.Mesh) => new T3.Box3().setFromObject(m).getSize(new T3.Vector3());
    const axes = [new T3.Vector3(1, 0, 0), new T3.Vector3(0, 1, 0), new T3.Vector3(0, 0, 1)];
    const longest = (v: T.Vector3) => axes[v.toArray().indexOf(Math.max(...v.toArray()))].clone();
    const thinnest = (v: T.Vector3) => axes[v.toArray().indexOf(Math.min(...v.toArray()))].clone();
    const L = longest(size(tooth)), N = thinnest(size(inner)), X = L.clone().cross(N);
    // Stand the tooth up (roots down) with the cut face toward the camera.
    this.holder = new T3.Group(); this.holder.add(model);
    this.holder.setRotationFromMatrix(new T3.Matrix4().makeBasis(X, L, N).invert());
    this.spin = new T3.Group(); this.spin.add(this.holder); this.scene.add(this.spin);
    this.holder.updateMatrixWorld(true);
    const tb = new T3.Box3().setFromObject(tooth), c = tb.getCenter(new T3.Vector3()); this.holder.position.sub(c); this.holder.updateMatrixWorld(true);
    const tb2 = new T3.Box3().setFromObject(tooth), ib = new T3.Box3().setFromObject(inner);
    this.zTop = tb2.max.z + 1; this.zMid = (ib.min.z + ib.max.z) / 2;
    const h = tb2.getSize(new T3.Vector3()).y, d = h * 3.5;
    this.camera.position.set(0, 0, d); this.camera.lookAt(0, 0, 0);
    // Materials: opaque, lit by the room environment. The shell is cut by the moving plane; the nerve strand is trimmed to the tooth.
    for (const m of [tooth, inner, veins]) if (m) { const mat = m.material as T.MeshStandardMaterial; mat.transparent = false; mat.depthWrite = true; mat.opacity = 1; mat.needsUpdate = true; }
    (tooth.material as T.Material).side = T3.FrontSide; this.shell = tooth.material as T.Material;
    this.cutLocal = new T3.Plane(new T3.Vector3(0, 0, -1), this.zTop); this.cutWorld = this.cutLocal.clone(); // the model carries a displaced fragment of shell beside the tooth; keep only what lies within the tooth's own footprint
    this.sideLocal = new T3.Plane(new T3.Vector3(-1, 0, 0), ib.max.x + 2); this.sideWorld = this.sideLocal.clone(); this.shell.clippingPlanes = [this.cutWorld, this.sideWorld];
    if (veins) {
      const vs = size(veins), vAxis = axes[vs.toArray().indexOf(Math.max(...vs.toArray()))].clone().transformDirection(this.holder.matrixWorld).normalize();
      const half = h * 0.75;
      this.stripLocal = [new T3.Plane(vAxis.clone(), half), new T3.Plane(vAxis.clone().negate(), half)]; this.stripWorld = this.stripLocal.map((p) => p.clone());
      (veins.material as T.Material).clippingPlanes = this.stripWorld;
    }
    this.setCut(reduced ? 0 : 0, true);
    const ro = new ResizeObserver(() => this.resize()); ro.observe(canvas.parentElement ?? canvas); this.cleanup.push(() => ro.disconnect());
    const io = new IntersectionObserver((e) => { this.visible = e[0].isIntersecting; this.kick(); }); io.observe(canvas); this.cleanup.push(() => io.disconnect());
    const host = canvas.parentElement ?? canvas;
    const down = (e: PointerEvent) => { this.dragging = true; this.lastX = e.clientX; this.vel = 0; host.setPointerCapture?.(e.pointerId); this.kick(); };
    const move = (e: PointerEvent) => { if (!this.dragging) return; const dx = e.clientX - this.lastX; this.lastX = e.clientX; this.az += dx * 0.008; this.vel = dx * 0.008; this.kick(); };
    const up = () => { this.dragging = false; };
    host.addEventListener('pointerdown', down); host.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    this.cleanup.push(() => { host.removeEventListener('pointerdown', down); host.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); });
    this.resize();
  }

  /** 0 = whole tooth, 1 = cut through to the pulp. */
  setCut(t: number, _jump = false): void { this.cutT = Math.min(1, Math.max(0, t)); this.cutLocal.constant = this.zTop + (this.zMid - this.zTop) * this.cutT; this.kick(); }

  private resize(): void { const el = this.renderer.domElement.parentElement ?? this.renderer.domElement, w = el.clientWidth || 1, h = el.clientHeight || 1; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.kick(); }
  private kick(): void { if (!this.running) { this.running = true; this.raf = requestAnimationFrame(this.frame); } }
  private frame = (): void => {
    if (!this.visible || document.hidden) { this.running = false; return; }
    if (!this.dragging) { this.az += this.vel; this.vel *= 0.92; }
    this.spin.rotation.y = this.az; this.spin.updateMatrixWorld(true);
    this.cutWorld.copy(this.cutLocal).applyMatrix4(this.spin.matrixWorld); this.sideWorld.copy(this.sideLocal).applyMatrix4(this.spin.matrixWorld);
    this.stripLocal.forEach((p, i) => this.stripWorld[i].copy(p).applyMatrix4(this.spin.matrixWorld));
    this.renderer.render(this.scene, this.camera);
    if (this.dragging || Math.abs(this.vel) > 1e-4) this.raf = requestAnimationFrame(this.frame); else this.running = false;
  };

  dispose(): void {
    cancelAnimationFrame(this.raf); this.running = false; this.cleanup.forEach((f) => f());
    this.scene.traverse((o) => { const m = o as T.Mesh; m.geometry?.dispose?.(); const mat = m.material as T.Material | undefined; mat?.dispose?.(); });
    this.renderer.dispose();
  }
}
