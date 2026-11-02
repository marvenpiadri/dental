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
      renderer.setPixelRatio(1); renderer.setSize(180, 330, false);
      const scene = makeToothScene(T, data, renderer);
      scene.camera.aspect = 180 / 330; scene.camera.position.set(0, 0, 9.6); scene.camera.lookAt(0, 0, 0); scene.camera.updateProjectionMatrix();
      return { T, scene, canvas };
    })());
  }

  /** The PNG (data URL) of tooth `no` in this state, or null when WebGL or the meshes are not available. */
  snap(no: number, state: ToothRecord, pulp: boolean): Promise<string | null> {
    if (!this.browser) return Promise.resolve(null);
    const key = `${no}|${pulp}|${JSON.stringify(state, (_k, v) => (v instanceof Set ? [...v].sort() : v instanceof Map ? [...v] : v))}`;
    const hit = this.cache.get(key);
    if (hit) return Promise.resolve(hit);
    const job = this.queue.then(async () => {
      const { scene, canvas } = await this.start();
      scene.apply(state, no, pulp);
      const url = canvas.toDataURL('image/png');
      this.cache.set(key, url);
      return url;
    }).catch(() => null);
    this.queue = job;
    return job;
  }
}
