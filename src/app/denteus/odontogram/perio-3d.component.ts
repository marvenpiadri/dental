import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, PLATFORM_ID, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { I18n } from '../../core/i18n/i18n.service';
import type { Chart } from './engine/chart';
import type { ToothEdit } from './engine/edits';
import { ENTRANCE_ANGLE, SITE_ANGLE, SURFACE_SITES, chartViz, levelAt, pocketTone, toothViz, type PerioSiteId, type ToothViz } from './perio-viz';
import { loadLib, makeToothScene, type Three } from './tooth-scene';

export type PerioLayer = 'depth' | 'recession' | 'bleeding' | 'plaque' | 'furcation' | 'mobility' | 'bone';
export const PERIO_LAYERS: readonly PerioLayer[] = ['depth', 'recession', 'bleeding', 'plaque', 'furcation', 'mobility', 'bone'];
export interface PerioSel { tooth: number; site: PerioSiteId }
type Geo = import('three').BufferGeometry;
const TONE = { shallow: 0x7a96ab, watch: 0xdf8a2f, deep: 0xc0392b } as const;
const SURFACE_ANGLE: Record<string, number> = { mesial: 0, buccal: 90, distal: 180, lingual: 270 };
const surfaceAt = (phi: number) => { const p = ((phi % 360) + 360) % 360; return p < 45 || p >= 315 ? 'mesial' : p < 135 ? 'buccal' : p < 225 ? 'distal' : 'lingual'; };

/**
 * The periodontium in 3D: every present tooth of one arch with a gum mesh around its neck, drawn from the chart record only.
 * Nothing here is stored or invented: PD, recession, bleeding, plaque, furcation and mobility come from toothViz(), and
 * edits leave as the same ToothEdit the six-site sheet emits.
 */
@Component({
  selector: 'den-perio-3d',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './perio-3d.component.html',
  styleUrl: './perio-3d.component.css',
})
export class Perio3dComponent implements OnDestroy {
  readonly chart = input.required<Chart>();
  readonly selected = input<PerioSel | null>(null);
  readonly disabled = input(false);
  readonly select = output<PerioSel | null>();
  readonly edit = output<{ tooth: number; edit: ToothEdit }>();

  protected readonly t = inject(I18n).t;
  protected readonly layerList = PERIO_LAYERS;
  protected readonly arch = signal<'upper' | 'lower'>('upper');
  protected readonly side = signal<'buccal' | 'lingual'>('buccal');
  protected readonly layers = signal<ReadonlySet<PerioLayer>>(new Set<PerioLayer>(['depth', 'recession', 'bleeding', 'plaque', 'furcation', 'mobility']));
  protected readonly failed = signal(false);
  protected readonly cur = computed(() => { const s = this.selected(); const v = s ? toothViz(this.chart(), s.tooth) : null; return v && s ? { v, site: v.sites.find((x) => x.site === s.site)!, tooth: s.tooth } : null; });
  protected layerName(l: PerioLayer) { return this.t(`dc.pv.${l}` as 'dc.pv.depth'); }

  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private ctx: { redraw: () => void; reset: () => void; focus: (tooth: number) => void; dispose: () => void } | null = null;
  private starting = false;

  constructor() {
    effect(() => {
      this.chart(); this.selected(); this.layers(); this.arch(); this.side();
      if (!this.browser) return;
      if (this.ctx) { this.ctx.redraw(); return; }
      if (!this.starting) { this.starting = true; this.start().then(() => this.ctx?.redraw()).catch((e) => { console.error("perio3d", e); this.failed.set(true); }); }
    });
  }
  ngOnDestroy(): void { this.ctx?.dispose(); this.ctx = null; }

  protected toggle(l: PerioLayer): void { const n = new Set(this.layers()); if (!n.delete(l)) n.add(l); this.layers.set(n); }
  protected reset(): void { this.ctx?.reset(); }
  protected setPd(e: Event): void { const c = this.cur(); if (c) { const raw = (e.target as HTMLInputElement).value.trim(); this.edit.emit({ tooth: c.tooth, edit: { kind: 'perio', site: c.site.site, pd: raw === '' ? null : Number(raw) } }); } }
  protected setGm(e: Event): void { const c = this.cur(), raw = (e.target as HTMLInputElement).value.trim(); if (c && raw !== '') this.edit.emit({ tooth: c.tooth, edit: { kind: 'perio', site: c.site.site, gm: Number(raw) } }); }
  protected flag(k: 'bop' | 'sup'): void { const c = this.cur(); if (c) this.edit.emit({ tooth: c.tooth, edit: { kind: 'perio', site: c.site.site, [k]: !c.site[k] } }); }
  protected focusTooth(tooth: number): void { this.ctx?.focus(tooth); this.select.emit({ tooth, site: this.selected()?.tooth === tooth ? this.selected()!.site : 'B' }); }
  protected readonly teeth = computed(() => chartViz(this.chart()).filter((v) => (this.arch() === 'upper') === (v.tooth < 30)).map((v) => v.tooth));

  private async start(): Promise<void> {
    const [T, { OrbitControls }, data] = await Promise.all([import('three') as Promise<Three>, import('three/examples/jsm/controls/OrbitControls.js'), loadLib()]);
    const el = this.host().nativeElement;
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const scene = new T.Scene(), camera = new T.PerspectiveCamera(30, 2, 0.1, 200);
    const sun = new T.DirectionalLight(0xffffff, 1.3); sun.position.set(3, 6, 10);
    scene.add(new T.AmbientLight(0xffffff, 0.95), sun);
    const row = new T.Group(); scene.add(row);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = false;
    const render = () => renderer.render(scene, camera);
    controls.addEventListener('change', render);
    type Entry = { s: ReturnType<typeof makeToothScene>; holder: import('three').Group; frame: import('three').Group; dyn: import('three').Group; no: number; width: number };
    const entries = new Map<number, Entry>();
    const hits: import('three').Mesh[] = [];
    let shownArch = '', homeDist = 22;

    /** A surface hanging off the tooth neck: columns at the angles `cols`, one row of {radius factor, y} per ring. */
    const surf = (e: Entry, cols: number[], rows: ((phi: number) => { k: number; y: number })[], rgb?: (phi: number) => [number, number, number], wrap = false): Geo => {
      const b = e.s.info().bounds, mes = e.s.info().mesial, rx = ((b[1][0] - b[0][0]) / 2) * 0.78, rz = ((b[1][2] - b[0][2]) / 2) * 0.8;
      const pos: number[] = [], col: number[] = [], idx: number[] = [];
      for (const phi of cols) for (const r of rows) { const { k, y } = r(phi), a = (phi * Math.PI) / 180; pos.push(Math.cos(a) * rx * k * mes, y, Math.sin(a) * rz * k); if (rgb) col.push(...rgb(phi)); }
      const R = rows.length, C = cols.length;
      for (let c = 0; c < (wrap ? C : C - 1); c++) for (let r = 0; r < R - 1; r++) { const a = c * R + r, b2 = ((c + 1) % C) * R + r; idx.push(a, b2, a + 1, b2, b2 + 1, a + 1); }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); if (rgb) g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
      g.setIndex(idx); g.computeVertexNormals(); return g;
    };
    const mat = (color: number, opacity: number, extra: Record<string, unknown> = {}) => new T.MeshStandardMaterial({ color, transparent: true, opacity, side: T.DoubleSide, depthWrite: false, roughness: 0.7, ...extra });
    const sphere = (e: Entry, phi: number, k: number, y: number, r: number, color: number, over = false) => {
      const b = e.s.info().bounds, mes = e.s.info().mesial, a = (phi * Math.PI) / 180;
      const m = new T.Mesh(new T.SphereGeometry(r, 14, 10), new T.MeshStandardMaterial({ color, roughness: 0.5, depthTest: !over }));
      m.position.set(Math.cos(a) * ((b[1][0] - b[0][0]) / 2) * 0.78 * k * mes, y, Math.sin(a) * ((b[1][2] - b[0][2]) / 2) * 0.8 * k); if (over) m.renderOrder = 5; return m;
    };
    const arc = (phi: number) => { const out: number[] = []; for (let d = -21; d <= 21; d += 7) out.push(phi + d); return out; };

    const draw = (e: Entry, v: ToothViz, on: ReadonlySet<PerioLayer>, sel: PerioSel | null) => {
      e.dyn.traverse((o) => { const m = o as import('three').Mesh; m.geometry?.dispose(); (m.material as import('three').Material | undefined)?.dispose?.(); });
      e.dyn.clear();
      const gm = (phi: number) => levelAt(v, phi, (s) => s.gm), cal = (phi: number) => levelAt(v, phi, (s) => s.cal);
      const papilla = (phi: number) => 1.5 * (Math.exp(-(((((phi + 180) % 360) - 180) / 24) ** 2)) + Math.exp(-((((phi % 360) - 180) / 24) ** 2)));
      const margin = (phi: number) => -gm(phi) + papilla(phi);
      const grade = (phi: number) => (v.gingival.get(surfaceAt(phi)) ?? 0) / 3;
      const pink: [number, number, number] = [0.95, 0.56, 0.56], red: [number, number, number] = [0.72, 0.25, 0.28];
      const around = Array.from({ length: 48 }, (_, i) => i * 7.5);
      const gum = new T.Mesh(surf(e, around, [(p) => ({ k: 1.02, y: margin(p) }), (p) => ({ k: 1.08, y: margin(p) - 0.8 }), (p) => ({ k: 1.18, y: margin(p) - 3 }), (p) => ({ k: 1.12, y: margin(p) - 7 })], (p) => pink.map((x, i) => x + (red[i] - x) * grade(p)) as [number, number, number], true), mat(0xffffff, on.has('bone') ? 0.25 : 0.62, { vertexColors: true }));
      gum.renderOrder = 1; e.dyn.add(gum);
      for (const s of v.sites) {
        const phi = SITE_ANGLE[s.site], top = -(s.gm ?? 0);
        if (on.has('depth') && s.pd !== null) { const m = new T.Mesh(surf(e, arc(phi), [() => ({ k: 1.03, y: top }), () => ({ k: 1.03, y: top - s.pd! })]), mat(TONE[pocketTone(s.pd)], 0.9)); m.renderOrder = 2; e.dyn.add(m); }
        if (on.has('recession') && (s.gm ?? 0) > 0) { const m = new T.Mesh(surf(e, arc(phi), [() => ({ k: 0.99, y: 0 }), () => ({ k: 0.99, y: top })]), mat(0xd8c48f, 0.85)); m.renderOrder = 2; e.dyn.add(m); }
        if (on.has('bleeding') && s.bop) e.dyn.add(sphere(e, phi, 1.08, top + 0.1, 0.5, 0xb3202a));
        if (on.has('bleeding') && s.sup) e.dyn.add(sphere(e, phi + 9, 1.08, top - 1, 0.42, 0xe3c21c));
        const hit = new T.Mesh(surf(e, arc(phi), [() => ({ k: 1.1, y: 2 }), () => ({ k: 1.1, y: top - Math.max(s.pd ?? 0, 3) - 2 })]), new T.MeshBasicMaterial({ transparent: true, opacity: sel && sel.tooth === v.tooth && sel.site === s.site ? 0.38 : 0, color: 0x16a34a, side: T.DoubleSide, depthWrite: false }));
        hit.userData = { tooth: v.tooth, site: s.site }; hit.renderOrder = 6; e.dyn.add(hit); hits.push(hit);
      }
      if (on.has('recession')) { const l = new T.LineLoop(new T.BufferGeometry().setFromPoints(around.map((p) => { const a = (p * Math.PI) / 180, b = e.s.info().bounds, mes = e.s.info().mesial; return new T.Vector3(Math.cos(a) * ((b[1][0] - b[0][0]) / 2) * 0.78 * 1.03 * mes, margin(p) + 0.05, Math.sin(a) * ((b[1][2] - b[0][2]) / 2) * 0.8 * 1.03); })), new T.LineBasicMaterial({ color: 0xc0392b })); l.renderOrder = 3; e.dyn.add(l); }
      if (on.has('plaque')) for (const surface of v.plaque) { const m = sphere(e, SURFACE_ANGLE[surface] ?? 0, 1.06, 1, 0.9, 0xeadf9a); m.scale.set(1.5, 0.55, 0.5); e.dyn.add(m); }
      if (on.has('furcation')) for (const f of v.furcation) e.dyn.add(sphere(e, ENTRANCE_ANGLE[f.entrance] ?? 0, 1.06, -4, 0.45 + 0.22 * f.grade, 0x252b2f, true));
      if (on.has('mobility') && v.mobility) {
        const top = e.s.info().bounds[1][1] + 3, len = 2 + v.mobility * 1.5, dark = new T.MeshBasicMaterial({ color: 0x2b3236 });
        const shaft = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, len * 2, 8), dark); shaft.rotation.z = Math.PI / 2; shaft.position.y = top;
        const head = (s: number) => { const c = new T.Mesh(new T.ConeGeometry(0.7, 1.4, 10), dark); c.rotation.z = (-s * Math.PI) / 2; c.position.set(s * (len + 0.5), top, 0); return c; };
        e.dyn.add(shaft, head(1), head(-1));
      }
      if (on.has('bone') && v.probed) {
        const ring = around.map((p) => { const a = (p * Math.PI) / 180, b = e.s.info().bounds, mes = e.s.info().mesial; return new T.Vector3(Math.cos(a) * ((b[1][0] - b[0][0]) / 2) * 0.78 * 1.16 * mes, -cal(p) + papilla(p) * 0.4, Math.sin(a) * ((b[1][2] - b[0][2]) / 2) * 0.8 * 1.16); });
        e.dyn.add(Object.assign(new T.LineLoop(new T.BufferGeometry().setFromPoints(ring), new T.LineBasicMaterial({ color: 0x4a4a4a })), { renderOrder: 3 }));
        const sleeve = new T.Mesh(surf(e, around, [(p) => ({ k: 1.16, y: -cal(p) + papilla(p) * 0.4 }), (p) => ({ k: 1.16, y: -cal(p) - 6 })], undefined, true), mat(0xcfc8b4, 0.4)); sleeve.renderOrder = 1; e.dyn.add(sleeve);
      }
    };

    const labels = document.createElement('div'); labels.className = 'pv-labels'; el.appendChild(labels);
    const layout = () => {
      const list = this.teeth(), want = new Set(list);
      for (const [no, e] of entries) if (!want.has(no)) { row.remove(e.holder); entries.delete(no); } // shortcut: tooth scenes are kept only while their arch shows
      for (const no of list) if (!entries.has(no)) {
        const s = makeToothScene(T, data, renderer);
        const holder = new T.Group(), frame = new T.Group(), dyn = new T.Group();
        s.apply(this.chart().status.get(no)!, no, false);
        holder.add(s.group); s.group.add(frame); frame.add(dyn); frame.position.y = -s.info().mid;
        const b = s.info().bounds; row.add(holder);
        entries.set(no, { s, holder, frame, dyn, no, width: (b[1][0] - b[0][0]) * s.group.scale.x });
      }
      let x = 0; const gap = 0.12;
      for (const no of list) { const e = entries.get(no)!; e.holder.position.set(x + e.width / 2, 0, 0); x += e.width + gap; }
      for (const e of entries.values()) e.holder.position.x -= (x - gap) / 2;
    };
    const place = () => {
      const w = el.clientWidth, h = el.clientHeight, v = new T.Vector3();
      for (const b of Array.from(labels.children) as HTMLElement[]) {
        const e = entries.get(Number(b.dataset['no'])); if (!e) continue;
        e.holder.getWorldPosition(v); v.y = this.arch() === 'upper' ? 2.7 : -2.7; v.project(camera);
        b.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%)`;
        b.classList.toggle('on', this.selected()?.tooth === e.no);
      }
    };
    controls.addEventListener('change', place);
    const resize = () => { const w = el.clientWidth || 600, h = el.clientHeight || 300; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); render(); place(); };
    const ro = new ResizeObserver(resize); ro.observe(el);

    const frameAll = () => { const w = el.clientWidth || 600, h = el.clientHeight || 300, span = Math.max(...Array.from(entries.values()).map((e) => Math.abs(e.holder.position.x)), 1) * 2 + 6; homeDist = Math.max(14, Math.min(60, (Math.max(span / (w / h), 7) / 2) / Math.tan((camera.fov * Math.PI) / 360))); camera.position.set(0, 0, homeDist); controls.target.set(0, 0, 0); controls.update(); };
    const redraw = () => {
      const key = this.arch();
      if (key !== shownArch) { for (const e of entries.values()) row.remove(e.holder); entries.clear(); shownArch = key; delete el.dataset['framed']; }
      layout(); hits.length = 0;
      row.rotation.y = this.side() === 'lingual' ? Math.PI : 0;
      for (const e of entries.values()) { const v = toothViz(this.chart(), e.no); if (v) draw(e, v, this.layers(), this.selected()); }
      labels.replaceChildren(...Array.from(entries.keys()).map((no) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'pv-no'; b.textContent = String(no); b.dataset['no'] = String(no); b.onclick = () => this.focusTooth(no); return b; }));
      if (!el.dataset['framed']) { el.dataset['framed'] = '1'; frameAll(); }
      render(); place();
    };

    const ray = new T.Raycaster(), ndc = new T.Vector2();
    let down: [number, number] | null = null;
    renderer.domElement.addEventListener('pointerdown', (ev) => { down = [ev.clientX, ev.clientY]; });
    renderer.domElement.addEventListener('pointerup', (ev) => {
      if (!down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 4) return; // a drag orbits, it does not pick
      const r = renderer.domElement.getBoundingClientRect(); ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera); row.updateMatrixWorld(true);
      const h = ray.intersectObjects(hits, false)[0]; if (h) this.select.emit({ tooth: h.object.userData['tooth'], site: h.object.userData['site'] }); else this.select.emit(null);
    });
    const focus = (tooth: number) => { const e = entries.get(tooth); if (!e) return; const p = new T.Vector3(); e.holder.getWorldPosition(p); controls.target.copy(p); camera.position.set(p.x, p.y, 7.5); controls.update(); };
    const reset = () => { frameAll(); };
    this.ctx = { redraw, reset, focus, dispose: () => { ro.disconnect(); controls.dispose(); renderer.dispose(); renderer.domElement.remove(); labels.remove(); for (const e of entries.values()) e.s.dispose(); } };
  }
}
