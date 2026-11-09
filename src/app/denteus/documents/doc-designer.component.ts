import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { AuthService } from '../../core/auth/auth.service';
import { I18n, Key } from '../../core/i18n/i18n.service';
import { DentalStore } from '../services/dental-store.service';
import { CHART_KINDS, DOC_KINDS, DOC_STYLES, DocKind, DocTemplate, PRESETS, SECTIONS, SectionId, normalizeTemplate, renderDocument } from './doc-engine';
import { Documents } from './documents.service';
import { sampleChart, sampleDoc } from './sample';

const KIND_KEY: Record<DocKind, Key> = { invoice: 'doc.kind.invoice', quote: 'doc.kind.quote', receipt: 'doc.kind.receipt', statement: 'doc.kind.statement', prescription: 'doc.kind.prescription', report: 'doc.kind.report', letter: 'doc.kind.letter' };
const SECTION_KEY: Record<SectionId, Key> = { sender: 'doc.sec.sender', title: 'doc.sec.title', facts: 'doc.sec.facts', body: 'doc.sec.body', chart: 'doc.sec.chart', notes: 'doc.sec.notes', signature: 'doc.sec.signature' };
const STYLE_KEY = { modern: 'doc.style.modern', minimal: 'doc.style.minimal', bold: 'doc.style.bold' } as const satisfies Record<string, Key>;
const SWATCHES = ['#0a0a0a', '#1d4ed8', '#047857', '#b45309', '#9f1239'];

/** Settings → Documents. Pick a document, change how it looks and what it shows, see it live, save it as a template. */
@Component({
  selector: 'den-doc-designer',
  templateUrl: './doc-designer.component.html',
  styleUrl: './doc-designer.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocDesignerComponent {
  protected readonly docs = inject(Documents);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  private readonly store = inject(DentalStore);
  private readonly auth = inject(AuthService);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly kinds = DOC_KINDS; protected readonly chartKinds = CHART_KINDS; protected readonly styles = DOC_STYLES; protected readonly sections = SECTIONS; protected readonly presets = PRESETS;
  protected readonly kindKey = KIND_KEY; protected readonly sectionKey = SECTION_KEY; protected readonly styleKey = STYLE_KEY; protected readonly swatches = SWATCHES;
  protected readonly canEdit = computed(() => this.auth.can('settings.edit'));

  protected readonly kind = signal<DocKind>('invoice');
  protected readonly draft = signal<DocTemplate>(this.docs.templateFor('invoice'));
  protected readonly name = signal('');
  protected readonly saved = signal(false);
  protected readonly isCustom = computed(() => !this.draft().builtin);
  protected readonly isDefault = computed(() => this.docs.templateFor(this.kind()).id === this.draft().id);

  private readonly chartRaw = sampleChart();
  /** The very HTML that prints, shown without opening the print dialog. */
  protected readonly preview = computed(() => {
    const k = this.kind(), tpl = this.draft();
    const c = sampleDoc(k, this.t, this.store.locations()[0]?.name ?? this.t('doc.sample.clinic'), this.i18n.lang(), (n) => this.i18n.money(n));
    c.chartTitle = undefined;
    return this.sanitizer.bypassSecurityTrustHtml(renderDocument(c, tpl, { chart: this.docs.chartFor(k, tpl, this.chartRaw), preview: true }));
  });

  protected pickKind(k: string): void { this.kind.set(k as DocKind); this.draft.set(this.docs.templateFor(k as DocKind)); this.saved.set(false); }
  protected pickTemplate(id: string): void { const t = this.docs.all().find((x) => x.id === id); if (t) { this.draft.set(structuredClone(t)); this.saved.set(false); } }
  protected patch(p: Partial<DocTemplate>): void { this.draft.update((d) => ({ ...d, ...p })); this.saved.set(false); }

  protected move(s: SectionId, by: -1 | 1): void {
    this.draft.update((d) => {
      const order = [...d.order], i = order.indexOf(s), j = i + by;
      if (j < 0 || j >= order.length) return d;
      [order[i], order[j]] = [order[j], order[i]];
      return { ...d, order };
    });
  }
  protected toggleSection(s: SectionId, on: boolean): void { this.patch({ hidden: on ? this.draft().hidden.filter((x) => x !== s) : [...this.draft().hidden, s] }); }
  protected toggleChartKind(k: DocKind, on: boolean): void { this.patch({ chartKinds: on ? [...this.draft().chartKinds, k] : this.draft().chartKinds.filter((x) => x !== k) }); }

  protected logoFile(e: Event): void {
    const input = e.target as HTMLInputElement, file = input.files?.[0];
    input.value = '';
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) return;
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 320 / img.width, 160 / img.height), c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      this.patch({ logo: c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.9) });
    };
    img.src = url;
  }

  protected async save(asNew: boolean): Promise<void> {
    const d = this.draft();
    const named = (asNew || d.builtin ? this.name().trim() || `${d.name} 2` : d.name).slice(0, 40);
    const t = normalizeTemplate({ ...d, id: asNew || d.builtin ? crypto.randomUUID() : d.id, name: named });
    if (!t) return;
    await this.docs.save(t);
    this.draft.set(t); this.name.set(''); this.saved.set(true);
  }
  protected async useForKind(): Promise<void> {
    const stored = this.docs.all().find((x) => x.id === this.draft().id);
    if (!stored || JSON.stringify(stored) !== JSON.stringify(this.draft())) await this.save(false); // keep what you see, as a template
    await this.docs.setDefault(this.kind(), this.draft().id);
    this.saved.set(true);
  }
  protected async remove(): Promise<void> {
    const id = this.draft().id;
    await this.docs.remove(id);
    this.draft.set(this.docs.templateFor(this.kind()));
  }
  protected printSample(): void {
    const k = this.kind(), tpl = this.draft();
    const c = sampleDoc(k, this.t, this.store.locations()[0]?.name ?? this.t('doc.sample.clinic'), this.i18n.lang(), (n) => this.i18n.money(n));
    this.docs.print(renderDocument(c, tpl, { chart: this.docs.chartFor(k, tpl, this.chartRaw) }));
  }
}
