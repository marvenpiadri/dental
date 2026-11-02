import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { ToothRecord } from './engine/chart';
import { loadLib, makeToothScene, type Three } from './tooth-scene';

/** Pictures of library teeth for the chart: one hidden renderer draws each tooth from the front and hands back a PNG. Same painting as the 3D view. */
@Injectable({ providedIn: 'root' })
export class ToothSnap {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly cache = new Map<string, string>();
  private queue: Promise<unknown> = Promise.resolve();
  private ctx: Promise<{ T: Three; scene: ReturnType<typeof makeToothScene>; canvas: HTMLCanvasElement }> | null = null;

  private start() {
    return (this.ctx ??= (async () => {
      const [T, data] = await Promise.all([import('three') as Promise<Three>, loadLib()]);
      const canvas = document.createElement('canvas');
      const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1);
      const scene = makeToothScene(T, data, renderer);
      return { T, scene, canvas };
    })());
  }

  /** Front view (buccal side, roots out of the crown) or top view (looking onto the biting face). */
  private view(s: ReturnType<typeof makeToothScene>, canvas: HTMLCanvasElement, no: number, top: boolean): void {
    const size = top ? [180, 180] : [180, 330];
    if (canvas.width !== size[0] || canvas.height !== size[1]) { canvas.width = size[0]; canvas.height = size[1]; s.renderer.setSize(size[0], size[1], false); }
    s.camera.aspect = size[0] / size[1];
    s.camera.up.set(0, 1, 0);
    if (top) { const d = no < 30 ? -5 : 5; s.camera.position.set(0, d, 0.001); s.camera.up.set(0, 0, -1); } else s.camera.position.set(0, 0, 9.6);
    s.camera.lookAt(0, 0, 0); s.camera.updateProjectionMatrix();
  }

  /** The surface under a click on the top-view picture (x, y in 0..1 across it), or null. */
  surfaceAt(no: number, state: ToothRecord, pulp: boolean, x: number, y: number): Promise<string | null> {
    const job = this.queue.then(async () => {
      const { scene, canvas } = await this.start();
      this.view(scene, canvas, no, true);
      scene.apply(state, no, pulp);
      return scene.areaAt(new (await import('three')).Vector2(x * 2 - 1, 1 - y * 2));
    }).catch(() => null);
    this.queue = job;
    return job;
  }

  /** The PNG (data URL) of tooth `no` in this state, or null when WebGL or the meshes are not available. */
  snap(no: number, state: ToothRecord, pulp: boolean, top = false): Promise<string | null> {
    if (!this.browser) return Promise.resolve(null);
    const key = `${top ? 'top' : 'front'}|${no}|${pulp}|${JSON.stringify(state, (_k, v) => (v instanceof Set ? [...v].sort() : v instanceof Map ? [...v] : v))}`;
    const hit = this.cache.get(key);
    if (hit) return Promise.resolve(hit);
    const job = this.queue.then(async () => {
      const { scene, canvas } = await this.start();
      this.view(scene, canvas, no, top);
      scene.apply(state, no, pulp);
      const url = canvas.toDataURL('image/png');
      this.cache.set(key, url);
      return url;
    }).catch(() => null);
    this.queue = job;
    return job;
  }
}
