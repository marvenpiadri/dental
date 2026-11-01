import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, PLATFORM_ID, effect, inject, input, output, viewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { ToothRecord } from './engine/chart';
import type { CubeSurface } from './surface-cube.component';
import { loadLib, makeToothScene, type Three } from './tooth-scene';

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
  /** Shown instead of the view when WebGL or the meshes cannot load. */
  readonly unavailable = input('');
  /** A click on the crown, resolved to one of the five surfaces from the hit face's local normal. */
  readonly surface = output<CubeSurface>();
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private ctx: { apply: (t: ToothRecord, no: number, pulp: boolean) => void; dispose: () => void } | null = null;
  private starting = false;

  constructor() {
    effect(() => {
      const t = this.state(), no = this.no(), pulp = this.showPulp();
      if (!this.browser) return;
      if (this.ctx) { this.ctx.apply(t, no, pulp); return; }
      if (!this.starting) { this.starting = true; void this.start().then(() => this.ctx?.apply(this.state(), this.no(), this.showPulp())).catch(() => { this.host().nativeElement.textContent = this.unavailable(); }); }
    });
  }

  ngOnDestroy(): void { this.ctx?.dispose(); this.ctx = null; }

  private async start(): Promise<void> {
    const [T, { OrbitControls }, data] = await Promise.all([import('three') as Promise<Three>, import('three/examples/jsm/controls/OrbitControls.js'), loadLib()]);
    const el = this.host().nativeElement;
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    let controls: import('three/examples/jsm/controls/OrbitControls.js').OrbitControls | null = null;
    const s = makeToothScene(T, data, renderer, () => { if (controls) { controls.target.set(0, 0, 0); s.camera.position.set(2.5, 1, 7.5).setLength(9); controls.update(); } });
    controls = new OrbitControls(s.camera, renderer.domElement);
    controls.enableDamping = false;
    controls.addEventListener('change', s.render);
    const resize = () => { const w = el.clientWidth || 300, h = el.clientHeight || 300; renderer.setSize(w, h); s.camera.aspect = w / h; s.camera.updateProjectionMatrix(); s.render(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    const ray = new T.Raycaster(), ndc = new T.Vector2();
    let down: [number, number] | null = null;
    renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
    renderer.domElement.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4 || !s.tooth.visible || s.tooth.userData['ghost']) return;
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, s.camera);
      const hit = ray.intersectObject(s.tooth, false)[0];
      if (!hit?.face) return;
      const p = s.tooth.worldToLocal(hit.point.clone());
      const n = hit.face.normal; // already in the tooth's own frame: +y toward the bite, +z toward the lip or cheek
      const z: CubeSurface = n.y > 0.7 ? 'occlusal' : n.z > 0.5 ? 'buccal' : n.z < -0.5 ? 'lingual' : p.x * s.mesial() > 0 ? 'mesial' : 'distal';
      this.surface.emit(z);
    });
    this.ctx = { apply: s.apply, dispose: () => { ro.disconnect(); controls?.dispose(); renderer.dispose(); renderer.domElement.remove(); s.dispose(); } };
  }
}
