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

  /** Front view (buccal side, roots out of the crown) or surface view (crown only, from the biting side, zoomed in). */
  private show(s: ReturnType<typeof makeToothScene>, canvas: HTMLCanvasElement, no: number, state: ToothRecord, pulp: boolean, top: boolean): void {
    const size = top ? [200, 200] : [180, 330];
    if (canvas.width !== size[0] || canvas.height !== size[1]) { canvas.width = size[0]; canvas.height = size[1]; s.renderer.setSize(size[0], size[1], false); }
    s.camera.aspect = size[0] / size[1];
    s.setTop(top);
    if (!top) { s.camera.updateProjectionMatrix(); }
    s.apply(state, no, pulp);
    if (top) s.frameTop(no);
  }

  /** The surface under a click on the surface-view picture (x, y in 0..1 across it), or null. */
  surfaceAt(no: number, state: ToothRecord, pulp: boolean, x: number, y: number): Promise<string | null> {
    const job = this.queue.then(async () => {
      const { scene, canvas } = await this.start();
      this.show(scene, canvas, no, state, pulp, true);
      return scene.areaAt(new (await import('three')).Vector2(x * 2 - 1, 1 - y * 2));
    }).catch(() => null);
    this.queue = job;
    return job;
  }

  /** The PNG (data URL) of tooth `no` in this state, or null when WebGL or the meshes are not available. */
  snap(no: number, state: ToothRecord, pulp: boolean, top = false, marked: readonly string[] = []): Promise<string | null> {
    if (!this.browser) return Promise.resolve(null);
    const key = `${top ? 'top' : 'front'}|${no}|${pulp}|${marked.join(',')}|${JSON.stringify(state, (_k, v) => (v instanceof Set ? [...v].sort() : v instanceof Map ? [...v] : v))}`;
    const hit = this.cache.get(key);
    if (hit) return Promise.resolve(hit);
    const job = this.queue.then(async () => {
      const { scene, canvas } = await this.start();
      this.show(scene, canvas, no, state, pulp, top);
      scene.setHighlight(null, marked);
      const url = canvas.toDataURL('image/png');
      this.cache.set(key, url);
      return url;
    }).catch(() => null);
    this.queue = job;
    return job;
  }
}
