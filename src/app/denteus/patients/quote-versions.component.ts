import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18n, Key } from '../../core/i18n/i18n.service';
import { PlanProposal, TreatmentItem } from '../models/dental.models';
import { DentalStore } from '../services/dental-store.service';
import { addProposal } from './patient-rules';
import { procedureName } from './treatment-rules';

const TONE = { proposed: 'warn', accepted: 'ok', declined: 'danger', superseded: 'neutral' } as const;

/** Dated versions of the quote given to the patient, and whether they accepted it. The plan itself is never changed here. */
@Component({
  selector: 'den-quote-versions',
  template: `
    <section class="versions" [attr.aria-label]="t('quote.versions')">
      <div class="head">
        <h3 class="card-title">{{ t('quote.versions') }}</h3>
        <button type="button" class="btn" [disabled]="!planned().length" (click)="record()"><i class="fa-solid fa-file-circle-plus" aria-hidden="true"></i>{{ t('quote.record') }}</button>
      </div>
      @for (v of sorted(); track v.id) {
        <div class="row">
          <span class="grow"><strong>{{ t('quote.version', { n: v.version }) }}</strong> <span class="muted">· {{ day(v.at) }} · {{ i18n.money(v.total) }} · {{ v.lines.length }} {{ t('quote.lines') }}@if (v.decidedAt) { · {{ day(v.decidedAt) }} }</span></span>
          <span class="chip" [attr.data-tone]="tone[v.status]">{{ t(statusKey[v.status]) }}</span>
          @if (v.status === 'proposed') {
            <button type="button" class="btn" (click)="decide(v.id, 'accepted')">{{ t('quote.accept') }}</button>
            <button type="button" class="btn" (click)="decide(v.id, 'declined')">{{ t('quote.decline') }}</button>
          }
        </div>
      } @empty { <p class="empty-note">{{ t('quote.versions.empty') }}</p> }
    </section>`,
  styles: `.versions { margin-top: 16px; } .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; } .row { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-top: 1px solid var(--line, currentColor); flex-wrap: wrap; } .grow { flex: 1; min-width: 200px; }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuoteVersionsComponent {
  readonly patientId = input.required<string>();
  readonly plan = input<TreatmentItem[]>([]);
  readonly proposals = input<PlanProposal[]>([]);

  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  private readonly store = inject(DentalStore);
  protected readonly tone = TONE;
  protected readonly statusKey: Record<PlanProposal['status'], Key> = { proposed: 'quote.st.proposed', accepted: 'quote.st.accepted', declined: 'quote.st.declined', superseded: 'quote.st.superseded' };
  protected readonly planned = computed(() => this.plan().filter((i) => i.status === 'planned'));
  protected readonly sorted = computed(() => [...this.proposals()].sort((a, b) => b.version - a.version));
  protected day = (iso: string): string => this.i18n.date(new Date(iso), { day: 'numeric', month: 'short', year: 'numeric' });

  protected record(): void {
    const lines = this.planned().map((i) => ({ ...(i.tooth && { tooth: i.tooth }), name: procedureName(this.t, i.procedure, i.name), price: i.price }));
    if (!lines.length) return;
    const total = lines.reduce((n, l) => n + l.price, 0);
    this.store.changeProposals(this.patientId(), (list) => addProposal<PlanProposal>(list, (version) => ({ id: crypto.randomUUID(), version, at: new Date().toISOString(), lines, total, status: 'proposed' })));
  }

  protected decide(id: string, status: 'accepted' | 'declined'): void {
    this.store.changeProposals(this.patientId(), (list) => list.map((v) => (v.id === id && v.status === 'proposed' ? { ...v, status, decidedAt: new Date().toISOString() } : v)));
  }
}
