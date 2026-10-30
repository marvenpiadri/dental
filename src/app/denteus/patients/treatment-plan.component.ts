import { RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import { Payment, TreatmentItem } from '../models/dental.models';
import { DentalStore } from '../services/dental-store.service';
import { quoteHtml } from './quote-html';
import { allocate, parsePrice, planTotals, procedureName } from './treatment-rules';
import { CHILD_LOWER, CHILD_UPPER, LOWER, UPPER } from './tooth-numbers';

/** The patient's treatment plan: add work (optionally on a tooth), mark it done, see what is left to pay. */
@Component({
  selector: 'den-treatment-plan',
  imports: [RouterLink],
  templateUrl: './treatment-plan.component.html',
  styleUrl: './treatment-plan.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TreatmentPlanComponent {
  readonly plan = input<TreatmentItem[]>([]);
  /** A tooth picked in the chart: preselected in the add form. */
  readonly tooth = input<string | null>(null);
  readonly patientName = input('');
  readonly payments = input<Payment[]>([]);
  /** Quotes page: show only the planned work. */
  readonly only = input<'planned' | null>(null);
  /** Hides the add form: new acts are written in the act editor, with the chart. */
  readonly readonlyAdd = input(false);
  readonly edit = output<(plan: TreatmentItem[]) => TreatmentItem[]>();

  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly store = inject(DentalStore);
  protected readonly catalog = this.store.catalog;
  protected readonly nameOf = (id: string, name?: string) => procedureName(this.t, id, name);
  protected readonly teeth = [...UPPER, ...LOWER, ...CHILD_UPPER, ...CHILD_LOWER].sort((a, b) => +a - +b);

  protected readonly draftTooth = signal('');
  protected readonly draftProcedure = signal('');
  protected readonly draftPrice = signal('');
  protected readonly priceInvalid = signal(false);

  private readonly alloc = computed(() => allocate(this.plan(), this.payments()));
  protected paid(i: TreatmentItem) { return this.alloc().get(i.id) ?? { received: 0, remaining: i.price }; }
  protected dayOf(i: TreatmentItem): string {
    const d = i.date ?? i.doneAt?.slice(0, 10);
    return d ? this.i18n.date(new Date(`${d}T12:00:00`), { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  }
  protected readonly totals = computed(() => planTotals(this.plan()));
  protected readonly sorted = computed(() =>
    this.plan().filter((i) => !this.only() || i.status === this.only()).sort((a, b) => (a.status === b.status ? +(a.tooth ?? 99) - +(b.tooth ?? 99) : a.status === 'planned' ? -1 : 1)));

  constructor() {
    // preselect the first act once the catalog has loaded
    effect(() => {
      const first = this.catalog()[0];
      if (first && !this.draftProcedure()) untracked(() => this.setProcedure(first.id));
    });
    effect(() => {
      const tooth = this.tooth();
      if (tooth) untracked(() => this.draftTooth.set(tooth));
    });
  }

  protected setProcedure(id: string): void {
    this.draftProcedure.set(id);
    this.draftPrice.set(String(this.catalog().find((entry) => entry.id === id)?.price ?? ''));
    this.priceInvalid.set(false);
  }

  protected add(): void {
    const price = parsePrice(this.draftPrice());
    if (price === null) { this.priceInvalid.set(true); return; }
    const entry = this.catalog().find((e) => e.id === this.draftProcedure());
    if (!entry) return; // an empty catalog has nothing to add: the form shows a hint
    const item: TreatmentItem = { id: crypto.randomUUID(), procedure: entry.id, name: this.nameOf(entry.id, entry.name), price, status: 'planned' };
    if (this.draftTooth()) item.tooth = this.draftTooth();
    this.edit.emit((plan) => [...plan, item]);
    this.priceInvalid.set(false);
  }

  protected toggle(item: TreatmentItem): void {
    const done = item.status === 'planned';
    this.edit.emit((plan) => plan.map((i) => (i.id === item.id ? { ...i, status: done ? 'done' : 'planned', doneAt: done ? new Date().toISOString() : undefined } : i)));
  }

  /** Opens the quote for the planned work in a new window and prints it. A blocked pop-up simply does nothing. */
  protected printQuote(): void {
    const lines = this.sorted().filter((i) => i.status === 'planned').map((i) => ({ tooth: i.tooth ?? '', name: this.nameOf(i.procedure, i.name), price: this.i18n.money(i.price) }));
    if (!lines.length) return;
    const t = this.t;
    const html = quoteHtml({
      clinic: this.store.locations()[0]?.name ?? 'Dentaleus',
      patient: this.patientName(),
      date: this.i18n.date(new Date(), { day: 'numeric', month: 'long', year: 'numeric' }),
      lines,
      total: this.i18n.money(this.totals().planned),
      labels: { title: t('quote.title'), patient: t('receipt.patient'), date: t('receipt.date'), tooth: t('plan.tooth'), act: t('plan.procedure'), price: t('plan.price'), total: t('quote.total'), note: t('quote.note') },
      lang: this.i18n.lang(),
    });
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  protected remove(item: TreatmentItem): void {
    this.edit.emit((plan) => plan.filter((i) => i.id !== item.id));
  }
}
