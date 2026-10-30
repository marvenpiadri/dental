import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, computed, inject, input, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { I18n, Key } from '../../core/i18n/i18n.service';
import { Patient } from '../models/dental.models';
import { DentalStore } from '../services/dental-store.service';
import { procedureName } from '../patients/treatment-rules';
import { FORM_SOURCES, FormField, FormSource, FormTemplate, sourceValue } from './form-models';
import { FormTemplates } from './form-templates.service';
import { PageImage, acroFields, detectBlanks, exportFilled, labelBlanks, renderPages } from './form-pdf';

type Mode = 'list' | 'design' | 'fill';
const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Paper forms (CNSS, CNOPS, certificates, anything): upload one, the app finds its blanks, the clinic checks them,
 * then each patient's copy is filled from their file, edited like a form and downloaded as a PDF.
 */
@Component({
  selector: 'den-forms',
  templateUrl: './forms.component.html',
  styleUrl: './forms.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormsComponent {
  readonly patient = input.required<Patient>();

  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  private readonly store = inject(DentalStore);
  private readonly service = inject(FormTemplates);
  protected readonly templates = this.service.templates;
  protected readonly sources = FORM_SOURCES;
  protected readonly sourceKey = (s: FormSource) => `fs.${s}` as Key;

  protected readonly mode = signal<Mode>('list');
  protected readonly current = signal<FormTemplate | null>(null);
  protected readonly images = signal<PageImage[]>([]);
  protected readonly pageNo = signal(0);
  protected readonly selected = signal<string | null>(null);
  protected readonly values = signal<Record<string, string>>({});
  protected readonly draft = signal<{ x: number; y: number; w: number; h: number } | null>(null);
  protected readonly busy = signal(false);
  protected readonly message = signal<{ tone: 'ok' | 'bad'; key: Key; n?: number } | null>(null);
  private origin: { x: number; y: number } | null = null;

  protected readonly img = computed(() => this.images()[this.pageNo()] ?? null);
  protected readonly size = computed(() => this.current()?.pages[this.pageNo()] ?? { w: 595, h: 842 });
  protected readonly pageFields = computed(() => (this.current()?.fields ?? []).filter((f) => f.page === this.pageNo()));

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) void this.service.load();
    inject(DestroyRef).onDestroy(() => this.release());
  }

  private release(): void { for (const i of this.images()) URL.revokeObjectURL(i.url); this.images.set([]); }

  protected async upload(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const kind = file.type === 'application/pdf' ? 'pdf' : /^image\/(png|jpeg)$/.test(file.type) ? 'image' : null;
    if (!kind || file.size > MAX_BYTES) { this.message.set({ tone: 'bad', key: 'forms.bad' }); return; }
    this.busy.set(true); this.message.set(null);
    try {
      const { pages, sizes } = await renderPages(file, kind);
      let fields = kind === 'pdf' ? await acroFields(file).catch(() => []) : [];
      if (!fields.length) {
        fields = pages.flatMap((p, i) => detectBlanks(p, i));
        if (kind === 'pdf') fields = await labelBlanks(file, fields, sizes).catch(() => fields);
      }
      const t: FormTemplate = { id: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, ''), kind, file, pages: sizes, fields };
      await this.service.put(t);
      this.release(); this.images.set(pages); this.current.set(t); this.pageNo.set(0); this.selected.set(null); this.mode.set('design');
      this.message.set({ tone: 'ok', key: 'forms.detected', n: fields.length });
    } catch (err) { console.error('form upload failed', err); this.message.set({ tone: 'bad', key: 'forms.storage' }); }
    this.busy.set(false);
  }

  protected async open(t: FormTemplate, mode: 'design' | 'fill'): Promise<void> {
    this.busy.set(true); this.message.set(null);
    try {
      const { pages } = await renderPages(t.file, t.kind);
      this.release(); this.images.set(pages); this.current.set(t); this.pageNo.set(0); this.selected.set(null); this.mode.set(mode);
      if (mode === 'fill') this.reset();
    } catch { this.message.set({ tone: 'bad', key: 'forms.storage' }); }
    this.busy.set(false);
  }

  protected back(): void { this.release(); this.current.set(null); this.mode.set('list'); this.message.set(null); }

  protected async remove(t: FormTemplate): Promise<void> {
    try { await this.service.remove(t.id); } catch { this.message.set({ tone: 'bad', key: 'forms.storage' }); }
  }

  /* ----- designer: draw, select, edit and delete blanks ----- */
  private async commit(change: (fields: FormField[]) => FormField[]): Promise<void> {
    const cur = this.current();
    if (!cur) return;
    const next = { ...cur, fields: change(cur.fields) };
    try { await this.service.put(next); this.current.set(next); } catch { this.message.set({ tone: 'bad', key: 'forms.storage' }); }
  }
  protected rename(name: string): void { const c = this.current(); if (c && name.trim()) { const next = { ...c, name: name.trim() }; this.current.set(next); void this.service.put(next); } }
  protected patchField(id: string, patch: Partial<FormField>): void { void this.commit((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f))); }
  protected removeField(id: string): void { if (this.selected() === id) this.selected.set(null); void this.commit((fs) => fs.filter((f) => f.id !== id)); }
  protected detect(): void {
    const img = this.img();
    if (img) void this.commit((fs) => [...fs, ...detectBlanks(img, this.pageNo()).filter((n) => !fs.some((f) => f.page === n.page && Math.abs(f.x - n.x) < 0.01 && Math.abs(f.y - n.y) < 0.01))]);
  }

  private point(e: PointerEvent, el: HTMLElement) { const r = el.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }; }
  protected down(e: PointerEvent, el: HTMLElement): void {
    if (this.mode() !== 'design') return;
    el.setPointerCapture(e.pointerId);
    this.origin = this.point(e, el); this.draft.set({ ...this.origin, w: 0, h: 0 }); this.selected.set(null);
  }
  protected move(e: PointerEvent, el: HTMLElement): void {
    if (!this.origin) return;
    const p = this.point(e, el), o = this.origin;
    this.draft.set({ x: Math.min(o.x, p.x), y: Math.min(o.y, p.y), w: Math.abs(p.x - o.x), h: Math.abs(p.y - o.y) });
  }
  protected up(): void {
    const d = this.draft();
    this.origin = null; this.draft.set(null);
    if (!d || d.w < 0.015 || d.h < 0.004) return; // a click, not a drag
    const field: FormField = { id: crypto.randomUUID(), label: `#${(this.current()?.fields.length ?? 0) + 1}`, page: this.pageNo(), source: 'text', ...d };
    this.selected.set(field.id);
    void this.commit((fs) => [...fs, field]);
  }

  /* ----- fill: every blank is an input over the page ----- */
  protected reset(): void {
    const cur = this.current();
    if (!cur) return;
    const ctx = { patient: this.patient(), clinic: this.store.locations()[0]?.name ?? '', today: new Date(), sexLabel: (s: 'female' | 'male') => this.t(s === 'female' ? 'form.sex.female' : 'form.sex.male'), actName: (i: { procedure: string; name?: string }) => procedureName(this.t, i.procedure, i.name) };
    this.values.set(Object.fromEntries(cur.fields.map((f) => [f.id, sourceValue(f.source, ctx)])));
  }
  protected setValue(id: string, v: string): void { this.values.update((m) => ({ ...m, [id]: v })); }
  protected ptOf(f: FormField): number { return f.size ?? Math.min(11, Math.max(6, f.h * this.size().h * 0.7)); }

  private async pdf(): Promise<Blob | null> {
    const cur = this.current();
    if (!cur) return null;
    this.busy.set(true);
    try { return await exportFilled(cur, this.values()); } catch { this.message.set({ tone: 'bad', key: 'forms.storage' }); return null; } finally { this.busy.set(false); }
  }
  protected async download(): Promise<void> {
    const blob = await this.pdf();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${this.current()!.name} - ${this.patient().fullName}.pdf`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  protected async print(): Promise<void> {
    const blob = await this.pdf();
    if (blob) window.open(URL.createObjectURL(blob), '_blank'); // the browser's PDF viewer prints it; a blocked pop-up does nothing
  }
}
