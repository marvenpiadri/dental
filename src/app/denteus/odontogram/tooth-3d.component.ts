import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, PLATFORM_ID, effect, inject, input, output, viewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { ToothRecord } from './engine/chart';
import { loadLib, makeToothScene, type Three } from './tooth-scene';

/** One tooth from the ToothFairy3 scan (case F_026), stood on its own long axis. Surfaces are painted by shader from the chart record. */
@Component({
  selector: 'den-tooth-3d',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #host class="host" role="img" aria-label="3D tooth"></div>`,
  styles: `:host { display: block; position: relative; } .host { width: 100%; height: 100%; min-height: 280px; touch-action: none; position: relative; overflow: hidden; }
    .host ::ng-deep .lbl-layer { position: absolute; inset: 0; pointer-events: none; }
    .host ::ng-deep .lbl { position: absolute; left: 0; top: 0; pointer-events: auto; cursor: pointer; font: 600 11px/1 system-ui, sans-serif; padding: 3px 6px; border: 1px solid var(--app-line, #ccc); background: var(--app-surface, #fff); color: var(--app-text, #111); white-space: nowrap; opacity: .85; }
    .host ::ng-deep .lbl.hov { opacity: 1; background: #22d3ee; color: #083344; border-color: #22d3ee; }
    .host ::ng-deep .lbl.on { background: #ff9f0a; color: #1c1200; border-color: #ff9f0a; opacity: 1; }`,
})
export class Tooth3dComponent implements OnDestroy {
  readonly no = input.required<number>();
  readonly state = input.required<ToothRecord>();
  /** Show the pulp chamber and canals through the tooth. */
  readonly showPulp = input(false);
  /** Shown instead of the view when WebGL or the meshes cannot load. */
  readonly unavailable = input('');
  /** Areas the user has selected (surface names, cervical, apical or root). */
  readonly selected = input<readonly string[]>([]);
  /** The dental name of each area for this tooth (incisal or occlusal, labial or buccal, palatal or lingual, ...). */
  readonly labels = input<Record<string, string>>({});
  readonly hover = output<string | null>();
  /** The roots this tooth has, in slot order (key = mb, db, p, m, d, b, l or single). */
  readonly roots = output<{ slot: number; key: string }[]>();
  /** A click on the tooth, resolved to an area. */
  readonly area = output<{ id: string; additive: boolean }>();
  private hovered: string | null = null;
  private relabel: (() => void) | null = null;
  private highlight: ((hover: string | null, selected: readonly string[]) => void) | null = null;
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private ctx: { apply: (t: ToothRecord, no: number, pulp: boolean) => void; roots: () => { slot: number; key: string }[]; dispose: () => void } | null = null;
  private starting = false;

  constructor() {
    effect(() => {
      const t = this.state(), no = this.no(), pulp = this.showPulp();
      if (!this.browser) return;
      const sel = this.selected(); this.labels();
      if (this.ctx) { this.ctx.apply(t, no, pulp); this.roots.emit(this.ctx.roots()); this.highlight?.(this.hovered, sel); this.relabel?.(); return; }
      if (!this.starting) { this.starting = true; void this.start().then(() => { this.ctx?.apply(this.state(), this.no(), this.showPulp()); this.roots.emit(this.ctx?.roots() ?? []); this.highlight?.(this.hovered, this.selected()); }).catch(() => { this.host().nativeElement.textContent = this.unavailable(); }); }
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
    const layer = document.createElement('div'); layer.className = 'lbl-layer'; el.appendChild(layer);
    const IDS = ['occlusal', 'buccal', 'lingual', 'mesial', 'distal', 'cervical', 'apical', 'root'];
    const btns = new Map(IDS.map((id) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'lbl'; b.addEventListener('click', (e) => this.area.emit({ id, additive: e.shiftKey || e.ctrlKey || e.metaKey })); b.addEventListener('pointerenter', () => { this.hovered = id; this.hover.emit(id); this.highlight?.(id, this.selected()); }); b.addEventListener('pointerleave', () => { this.hovered = null; this.hover.emit(null); this.highlight?.(null, this.selected()); }); layer.appendChild(b); return [id, b] as const; }));
    const place = () => {
      const w = el.clientWidth, hgt = el.clientHeight, names = this.labels(), sel = this.selected(), v = new T.Vector3();
      const pts = s.anchors();
      for (const [id, b] of btns) {
        const p = pts[id]; b.hidden = !p; if (!p) continue;
        v.copy(p).project(s.camera);
        b.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * hgt}px) translate(-50%, -50%)`;
        b.textContent = names[id] ?? id; b.classList.toggle('on', sel.includes(id)); b.classList.toggle('hov', this.hovered === id);
      }
    };
    const s = makeToothScene(T, data, renderer, () => { if (controls) { controls.target.set(0, 0, 0); s.camera.position.set(2.5, 1, 7.5).setLength(9); controls.update(); } }, place);
    this.relabel = place;
    controls = new OrbitControls(s.camera, renderer.domElement);
    controls.enableDamping = false;
    controls.addEventListener('change', s.render);
    const resize = () => { const w = el.clientWidth || 300, h = el.clientHeight || 300; renderer.setSize(w, h); s.camera.aspect = w / h; s.camera.updateProjectionMatrix(); s.render(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    const ndc = new T.Vector2();
    const at = (e: PointerEvent) => { const r = renderer.domElement.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); return s.areaAt(ndc); };
    let down: [number, number] | null = null;
    renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
    renderer.domElement.addEventListener('pointermove', (e) => { if (e.buttons) return; const a = at(e); if (a !== this.hovered) { this.hovered = a; this.hover.emit(a); this.highlight?.(a, this.selected()); } });
    renderer.domElement.addEventListener('pointerleave', () => { if (this.hovered !== null) { this.hovered = null; this.hover.emit(null); this.highlight?.(null, this.selected()); } });
    renderer.domElement.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return; // a drag rotates, it does not pick
      const a = at(e); if (a) this.area.emit({ id: a, additive: e.shiftKey || e.ctrlKey || e.metaKey });
    });
    this.highlight = (h, sel) => { s.setHighlight(h, sel); };
    this.ctx = { apply: s.apply, roots: s.rootList, dispose: () => { ro.disconnect(); controls?.dispose(); renderer.dispose(); renderer.domElement.remove(); s.dispose(); } };
  }
}
