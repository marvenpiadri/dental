import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, PLATFORM_ID, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { I18n } from '../../core/i18n/i18n.service';
import { readChart, type Chart } from './engine/chart';
import type { Examination } from './engine/exam';
import type { ToothEdit } from './engine/edits';
import { ENTRANCE_ANGLE, SITE_ANGLE, chartViz, levelAt, pdChange, perioStats, pocketTone, toothViz, type PerioSiteId, type ToothViz } from './perio-viz';
import { loadLib, makeToothScene, type Three } from './tooth-scene';

export type PerioLayer = 'depth' | 'recession' | 'bleeding' | 'plaque' | 'furcation' | 'mobility' | 'bone';
export const PERIO_LAYERS: readonly PerioLayer[] = ['depth', 'recession', 'bleeding', 'plaque', 'furcation', 'mobility', 'bone'];
export interface PerioSel { tooth: number; site: PerioSiteId }
type Geo = import('three').BufferGeometry;
const BUCCAL: readonly PerioSiteId[] = ['MB', 'B', 'DB'], LINGUAL: readonly PerioSiteId[] = ['ML', 'L', 'DL'];
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
  /** Earlier exams of this patient, offered for comparison. */
  readonly examinations = input<readonly Examination[]>([]);
  readonly select = output<PerioSel | null>();
  readonly edit = output<{ tooth: number; edit: ToothEdit }>();

  protected readonly t = inject(I18n).t;
  protected readonly layerList = PERIO_LAYERS;
  protected readonly arch = signal<'upper' | 'lower'>('upper');
  protected readonly side = signal<'buccal' | 'lingual'>('buccal');
  protected readonly layers = signal<ReadonlySet<PerioLayer>>(new Set<PerioLayer>(['depth', 'recession', 'bleeding', 'plaque', 'furcation', 'mobility']));
  protected readonly failed = signal(false);
  protected readonly compareId = signal('');
  /** The earlier exam chosen for comparison, read back through the engine like any saved chart. */
  protected readonly before = computed<Chart | null>(() => { const e = this.examinations().find((x) => x.id === this.compareId()); return e ? (readChart(e.chart).chart ?? null) : null; });
  protected readonly stats = computed(() => perioStats(this.chart(), this.before()));
  protected readonly changes = computed(() => { const p = this.panel(), b = this.before(); return p.v ? p.sites.map((s) => pdChange(p.v, p.tooth === null || !b ? null : toothViz(b, p.tooth), s.site)) : []; });
  protected setCompare(e: Event): void { this.compareId.set((e.target as HTMLSelectElement).value); }
  private readonly host0 = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Enter in a PD box moves to the next site, then to the next tooth: probing without leaving the keyboard. */
  protected advance(i: number): void {
    const boxes = () => Array.from(this.host0.nativeElement.querySelectorAll<HTMLInputElement>('.grid input[aria-label^="PD"]'));
    if (i < boxes().length - 1) boxes()[i + 1].focus();
    else { this.step(1); setTimeout(() => boxes()[0]?.focus()); }
  }
  /** The sites of the surface being viewed, for the selected tooth (or the first tooth of the arch while nothing is selected). */
  protected readonly panel = computed(() => {
    const sel = this.selected(), tooth = sel?.tooth ?? null, v = tooth === null ? null : toothViz(this.chart(), tooth);
    const names = this.side() === 'buccal' ? BUCCAL : LINGUAL;
    return { tooth, v, sites: v ? names.map((n) => v.sites.find((x) => x.site === n)!) : [], site: sel?.site ?? null };
  });
  protected readonly layerGroups: { key: 'dc.pv.g.probing' | 'dc.pv.g.findings' | 'dc.pv.g.structure'; items: readonly PerioLayer[] }[] = [
    { key: 'dc.pv.g.probing', items: ['depth', 'recession', 'bone'] }, { key: 'dc.pv.g.findings', items: ['bleeding', 'plaque'] }, { key: 'dc.pv.g.structure', items: ['furcation', 'mobility'] },
  ];
  protected readonly surfaces = ['buccal', 'lingual', 'mesial', 'distal'] as const;
  protected surfaceName(sf: string) { return this.t(`dc.idx.${sf}` as 'dc.idx.buccal'); }
  protected readonly swatch: Record<PerioLayer, string> = { depth: 'linear-gradient(90deg,#7a96ab 33%,#df8a2f 33% 66%,#c0392b 66%)', recession: '#d8c48f', bleeding: '#b3202a', plaque: '#eadf9a', furcation: '#252b2f', mobility: 'linear-gradient(90deg,#2b3236 20%,transparent 20% 80%,#2b3236 80%)', bone: '#4a4a4a' };
  private readonly followSide = effect(() => { const s = this.selected(); if (s) this.side.set((LINGUAL as readonly string[]).includes(s.site) ? 'lingual' : 'buccal'); });
  protected layerName(l: PerioLayer) { return this.t(`dc.pv.${l}` as 'dc.pv.depth'); }

  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private ctx: { redraw: () => void; reset: () => void; focus: (tooth: number) => void; dispose: () => void } | null = null;
  private starting = false;

  constructor() {
    effect(() => {
      this.chart(); this.selected(); this.layers(); this.arch(); this.side(); this.before();
      if (!this.browser) return;
      if (this.ctx) { this.ctx.redraw(); return; }
      if (!this.starting) { this.starting = true; this.start().then(() => this.ctx?.redraw()).catch((e) => { console.error("perio3d", e); this.failed.set(true); }); }
    });
  }
  ngOnDestroy(): void { this.ctx?.dispose(); this.ctx = null; }

  protected toggle(l: PerioLayer): void { const n = new Set(this.layers()); if (!n.delete(l)) n.add(l); this.layers.set(n); }
  protected reset(): void { this.ctx?.reset(); }
  protected pick(tooth: number, site: PerioSiteId): void { this.select.emit({ tooth, site }); }
  protected setPd(site: PerioSiteId, e: Event): void { const t = this.panel().tooth; if (t !== null) { const raw = (e.target as HTMLInputElement).value.trim(); this.edit.emit({ tooth: t, edit: { kind: 'perio', site, pd: raw === '' ? null : Number(raw) } }); } }
  protected setGm(site: PerioSiteId, e: Event): void { const t = this.panel().tooth, raw = (e.target as HTMLInputElement).value.trim(); if (t !== null && raw !== '') this.edit.emit({ tooth: t, edit: { kind: 'perio', site, gm: Number(raw) } }); }
  protected flag(site: PerioSiteId, k: 'bop' | 'sup', on: boolean): void { const t = this.panel().tooth; if (t !== null) this.edit.emit({ tooth: t, edit: { kind: 'perio', site, [k]: !on } }); }
  /** Move to the neighbouring tooth of the arch, keeping the same surface and position. */
  protected step(d: -1 | 1): void { const list = this.teeth(), cur = this.panel().tooth; if (!list.length) return; const i = cur === null ? (d > 0 ? 0 : list.length - 1) : (list.indexOf(cur) + d + list.length) % list.length; this.select.emit({ tooth: list[i], site: this.selected()?.site ?? (this.side() === 'buccal' ? 'B' : 'L') }); }
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
    const rim = new T.DirectionalLight(0xffffff, 0.5); rim.position.set(-6, -2, 6);
    scene.add(new T.HemisphereLight(0xffffff, 0xb9a89e, 0.9), sun, rim);
    const row = new T.Group(); scene.add(row);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = false;
    const render = () => renderer.render(scene, camera);
    controls.addEventListener('change', render);
    type Entry = { s: ReturnType<typeof makeToothScene>; holder: import('three').Group; frame: import('three').Group; dyn: import('three').Group; no: number; width: number; neck: number; rootLen: number; crownLen: number };
    const entries = new Map<number, Entry>();
    const hits: import('three').Mesh[] = [];
    let shownArch = '', homeDist = 22;

    /** A surface hanging off the tooth neck: columns at the angles `cols`, one row of {radius factor, y} per ring. */
    const surf = (e: Entry, cols: number[], rows: ((phi: number) => { k: number; y: number })[], rgba?: (phi: number, row: number) => number[], wrap = false): Geo => {
      const b = e.s.info().bounds, mes = e.s.info().mesial, rx = ((b[1][0] - b[0][0]) / 2) * 0.78, rz = ((b[1][2] - b[0][2]) / 2) * 0.8;
      const pos: number[] = [], col: number[] = [], idx: number[] = [];
      for (const phi of cols) rows.forEach((r, ri) => { const { k, y } = r(phi), a = (phi * Math.PI) / 180; pos.push(Math.cos(a) * rx * k * mes, y, Math.sin(a) * rz * k); if (rgba) col.push(...rgba(phi, ri)); });
      const R = rows.length, C = cols.length;
      for (let c = 0; c < (wrap ? C : C - 1); c++) for (let r = 0; r < R - 1; r++) { const a = c * R + r, b2 = ((c + 1) % C) * R + r; idx.push(a, b2, a + 1, b2, b2 + 1, a + 1); }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); if (rgba) g.setAttribute('color', new T.Float32BufferAttribute(col, 4));
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
      const papilla = (phi: number) => 1.8 * (Math.exp(-(((((phi + 180) % 360) - 180) / 30) ** 2)) + Math.exp(-((((phi % 360) - 180) / 30) ** 2)));
      const margin = (phi: number) => -gm(phi) + papilla(phi);
      const grade = (phi: number) => (v.gingival.get(surfaceAt(phi)) ?? 0) / 3;
      const pink = [0.96, 0.6, 0.6], red = [0.74, 0.22, 0.26], fade = [0.96, 0.96, 0.9, 0.55, 0]; // alpha fades toward the apex so the gum melts into the root
      const around = Array.from({ length: 60 }, (_, i) => i * 6);
      const gum = new T.Mesh(surf(e, around, [(p) => ({ k: 1.0, y: margin(p) }), (p) => ({ k: 1.05, y: margin(p) - 0.6 }), (p) => ({ k: 1.1, y: margin(p) - 2.2 }), (p) => ({ k: 1.12, y: margin(p) - 5 }), (p) => ({ k: 1.1, y: margin(p) - 9 })], (p, ri) => [...pink.map((x, i) => x + (red[i] - x) * grade(p) * (ri < 2 ? 1 : 0.7)), fade[ri] * (on.has('bone') ? 0.45 : 1)], true),
        new T.MeshPhysicalMaterial({ vertexColors: true, transparent: true, side: T.DoubleSide, depthWrite: false, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.35, sheen: 0.6, sheenColor: new T.Color(0xffb3b3) }));
      gum.renderOrder = 1; e.dyn.add(gum);
      for (const s of v.sites) {
        const phi = SITE_ANGLE[s.site], top = -(s.gm ?? 0);
        if (on.has('depth') && s.pd !== null) { const m = new T.Mesh(surf(e, arc(phi), [() => ({ k: 1.03, y: top }), () => ({ k: 1.03, y: top - s.pd! })]), mat(TONE[pocketTone(s.pd)], 0.9)); m.renderOrder = 2; e.dyn.add(m); }
        if (on.has('recession') && (s.gm ?? 0) > 0) { const m = new T.Mesh(surf(e, arc(phi), [() => ({ k: 0.99, y: 0 }), () => ({ k: 0.99, y: top })]), mat(0xd8c48f, 0.85)); m.renderOrder = 2; e.dyn.add(m); }
        if (on.has('bleeding') && s.bop) e.dyn.add(sphere(e, phi, 1.08, top + 0.1, 0.5, 0xb3202a));
        if (on.has('bleeding') && s.sup) e.dyn.add(sphere(e, phi + 9, 1.08, top - 1, 0.42, 0xe3c21c));
        const hit = new T.Mesh(surf(e, arc(phi), [() => ({ k: 1.1, y: 2 }), () => ({ k: 1.1, y: top - Math.max(s.pd ?? 0, 3) - 2 })]), new T.MeshBasicMaterial({ transparent: true, opacity: sel && sel.tooth === v.tooth && sel.site === s.site ? 0.5 : 0, color: 0x111111, side: T.DoubleSide, depthWrite: false }));
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
    const dataRows = document.createElement('div'); dataRows.className = 'pv-labels'; el.appendChild(dataRows);
    const layout = () => {
      const list = this.teeth(), want = new Set(list);
      for (const [no, e] of entries) if (!want.has(no)) { row.remove(e.holder); entries.delete(no); } // shortcut: tooth scenes are kept only while their arch shows
      for (const no of list) if (!entries.has(no)) {
        const s = makeToothScene(T, data, renderer);
        const holder = new T.Group(), frame = new T.Group(), dyn = new T.Group();
        s.apply(this.chart().status.get(no)!, no, false);
        holder.add(s.group); s.group.add(frame); frame.add(dyn); frame.position.y = -s.info().mid;
        const b = s.info().bounds; row.add(holder);
        row.updateMatrixWorld(true); const nv = new T.Vector3(); frame.getWorldPosition(nv); // line every neck up on y = 0 so the gingival line is level across the arch
        const sc = s.group.scale.x, inf = s.info();
        entries.set(no, { s, holder, frame, dyn, no, width: (b[1][0] - b[0][0]) * sc, neck: -nv.y, rootLen: -inf.ymin * sc, crownLen: inf.ymax * sc });
      }
      let x = 0; const gap = 0.12;
      for (const no of list) { const e = entries.get(no)!; e.holder.position.set(x + e.width / 2, e.neck, 0); x += e.width + gap; }
      for (const e of entries.values()) e.holder.position.x -= (x - gap) / 2;
    };
    const roots = () => Math.max(...Array.from(entries.values()).map((e) => e.rootLen), 3), crowns = () => Math.max(...Array.from(entries.values()).map((e) => e.crownLen), 1.5);
    const numY = () => (this.arch() === 'upper' ? roots() + 0.5 : -(roots() + 0.5));
    const dataY = () => (this.arch() === 'upper' ? -(crowns() + 0.9) : crowns() + 0.9);
    const sitePt = (e: Entry, site: PerioSiteId, out: import('three').Vector3) => { const b = e.s.info().bounds, mes = e.s.info().mesial, a = (SITE_ANGLE[site] * Math.PI) / 180; out.set(Math.cos(a) * ((b[1][0] - b[0][0]) / 2) * 0.78 * 1.1 * mes, 0, Math.sin(a) * ((b[1][2] - b[0][2]) / 2) * 0.8 * 1.1); return e.frame.localToWorld(out); };
    const place = () => {
      const w = el.clientWidth, h = el.clientHeight, v = new T.Vector3();
      for (const b of Array.from(dataRows.children) as HTMLElement[]) {
        const e = entries.get(Number(b.dataset['no'])); if (!e) continue;
        sitePt(e, b.dataset['site'] as PerioSiteId, v); v.y = dataY(); v.project(camera);
        b.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%)`;
        const sel = this.selected(); b.classList.toggle('on', sel?.tooth === e.no && sel.site === b.dataset['site']);
      }
      for (const b of Array.from(labels.children) as HTMLElement[]) {
        const e = entries.get(Number(b.dataset['no'])); if (!e) continue;
        e.holder.getWorldPosition(v); v.y = numY(); v.project(camera);
        b.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%)`;
        b.classList.toggle('on', this.selected()?.tooth === e.no);
      }
    };
    controls.addEventListener('change', place);
    const resize = () => { const w = el.clientWidth || 600, h = el.clientHeight || 300; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); render(); place(); };
    const ro = new ResizeObserver(resize); ro.observe(el);

    const frameAll = () => { const w = el.clientWidth || 600, h = el.clientHeight || 300, span = Math.max(...Array.from(entries.values()).map((e) => Math.abs(e.holder.position.x)), 1) * 2 + 3; homeDist = Math.max(14, Math.min(60, (Math.max(span / (w / h), 7) / 2) / Math.tan((camera.fov * Math.PI) / 360))); camera.position.set(0, 0, homeDist); controls.target.set(0, 0, 0); controls.update(); };
    const redraw = () => {
      const key = this.arch();
      if (key !== shownArch) { for (const e of entries.values()) row.remove(e.holder); entries.clear(); shownArch = key; delete el.dataset['framed']; }
      layout(); hits.length = 0;
      row.rotation.y = this.side() === 'lingual' ? Math.PI : 0;
      for (const e of entries.values()) { const v = toothViz(this.chart(), e.no); if (v) draw(e, v, this.layers(), this.selected()); }
      labels.replaceChildren(...Array.from(entries.keys()).map((no) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'pv-no'; b.textContent = String(no); b.dataset['no'] = String(no); b.onclick = () => this.focusTooth(no); return b; }));
      const names = this.side() === 'buccal' ? BUCCAL : LINGUAL;
      dataRows.replaceChildren(...Array.from(entries.keys()).flatMap((no) => { const v = toothViz(this.chart(), no); return names.map((site) => {
        const x = v?.sites.find((q) => q.site === site), b = document.createElement('button'); b.type = 'button'; b.className = 'pv-d'; b.dataset['no'] = String(no); b.dataset['site'] = site; b.onclick = () => this.pick(no, site);
        b.setAttribute('aria-label', `${no} ${site}`);
        const n = document.createElement('b'); n.className = `n ${x?.pd == null ? 'nil' : pocketTone(x.pd)}`; n.textContent = x?.pd == null ? '·' : String(x.pd);
        const old = this.before() ? toothViz(this.before()!, no) : null, dl = pdChange(v ?? null, old, site);
        const r = document.createElement('small'); r.textContent = [x?.gm && x.gm > 0 ? `R${x.gm}` : '', dl ? (dl > 0 ? `+${dl}` : `−${-dl}`) : ''].filter(Boolean).join(' '); if (dl && dl >= 2) r.className = 'worse';
        const dots = document.createElement('span'); dots.className = 'dots'; if (x?.bop) dots.append(Object.assign(document.createElement('i'), { className: 'bop' })); if (x?.sup) dots.append(Object.assign(document.createElement('i'), { className: 'sup' }));
        b.append(n, r, dots); return b; }); }));
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
    this.ctx = { redraw, reset, focus, dispose: () => { dataRows.remove(); ro.disconnect(); controls.dispose(); renderer.dispose(); renderer.domElement.remove(); labels.remove(); for (const e of entries.values()) e.s.dispose(); } };
  }
}
