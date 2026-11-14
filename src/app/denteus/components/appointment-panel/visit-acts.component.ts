import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { I18n } from '../../../core/i18n/i18n.service';
import { Appointment } from '../../models/dental.models';
import { DentalStore } from '../../services/dental-store.service';
import { parsePrice, procedureName } from '../../patients/treatment-rules';
import { actsOfVisit, completePlanned, plannedActs, recordVisitAct } from './visit-acts';

/**
 * The quick way to document a routine visit: pick an act from the clinic's catalog and record it as performed, with no tooth and
 * no chart. It writes to the patient's treatment plan like every other act, so billing, quotes and reports see it unchanged.
 */
@Component({
  selector: 'den-visit-acts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; margin-top: 18px; }
    h3 { font-size: 13px; font-weight: 600; margin: 0 0 8px; }
    .hint { color: var(--app-muted); font-size: 12px; margin: 0 0 8px; }
    ul { list-style: none; margin: 0 0 10px; padding: 0; border-top: 1px solid var(--app-line); }
    li { display: flex; justify-content: space-between; gap: 8px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--app-line); font-size: 13px; }
    li .tooth { color: var(--app-muted); font-size: 12px; margin-left: 6px; }
    form { display: flex; gap: 6px; margin-bottom: 8px; }
    select, input { min-width: 0; height: 32px; border: 1px solid var(--app-line); background: var(--app-bg); color: var(--app-text); border-radius: 6px; padding: 0 8px; font: inherit; font-size: 13px; }
    select { flex: 1; }
    input { width: 72px; text-align: right; }
    input[aria-invalid='true'] { border-color: var(--app-text); border-style: dashed; }
    button { height: 32px; border: 1px solid var(--app-line); background: var(--app-bg); color: var(--app-text); border-radius: 6px; padding: 0 10px; font: inherit; font-size: 13px; cursor: pointer; }
    button.primary { background: var(--app-text); color: var(--app-bg); border-color: var(--app-text); }
    button:hover { background: var(--app-hover); }
    button.primary:hover { background: var(--app-text); opacity: 0.88; }
    button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid var(--app-text); outline-offset: 1px; }
    .row { display: flex; gap: 6px; flex-wrap: wrap; }
    .live { min-height: 18px; font-size: 12px; margin: 0 0 6px; }
  `,
  template: `
    <h3>{{ t('va.title') }}</h3>
    <ul>
      @for (a of done(); track a.id) {
        <li><span>{{ nameOf(a.procedure, a.name) }}@if (a.tooth) {<span class="tooth">{{ a.tooth }}</span>}</span><span>{{ i18n.money(a.price) }}</span></li>
      } @empty {
        <li class="hint">{{ t('va.none') }}</li>
      }
    </ul>
    @if (canRecord()) {
      <p class="hint">{{ t('va.hint') }}</p>
      <form (submit)="$event.preventDefault(); record()">
        <select [attr.aria-label]="t('plan.procedure')" [value]="procedure()" (change)="pick($any($event.target).value)">
          @for (e of store.catalog(); track e.id) {
            <option [value]="e.id" [selected]="e.id === procedure()">{{ nameOf(e.id, e.name) }}</option>
          }
        </select>
        <input inputmode="decimal" [attr.aria-label]="t('plan.price')" [attr.aria-invalid]="invalid()" [value]="price()" (input)="price.set($any($event.target).value); invalid.set(false)" />
        <button type="submit" class="primary">{{ t('va.record') }}</button>
      </form>
      @if (planned().length) {
        <h3>{{ t('va.planned') }}</h3>
        <ul>
          @for (p of planned(); track p.id) {
            <li>
              <span>{{ nameOf(p.procedure, p.name) }}@if (p.tooth) {<span class="tooth">{{ p.tooth }}</span>}</span>
              <button type="button" (click)="finish(p.id, p.procedure, p.name)">{{ t('va.complete') }}</button>
            </li>
          }
        </ul>
      }
    }
    <p class="live" role="status">{{ message() }}</p>
    <div class="row">
      @if (auth.can('clinical.view')) { <button type="button" (click)="openFile.emit({ patientId: appointment().patientId, page: 'acts' })">{{ t('va.chart') }}</button> }
      @if (done().length && auth.can('billing.view')) {
        <button type="button" (click)="openFile.emit({ patientId: appointment().patientId, page: 'billing' })">{{ t('va.bill') }}</button>
      }
    </div>
  `,
})
export class VisitActsComponent {
  readonly appointment = input.required<Appointment>();
  readonly openFile = output<{ patientId: string; page: string }>();

  protected readonly store = inject(DentalStore);
  protected readonly i18n = inject(I18n);
  protected readonly auth = inject(AuthService);
  protected readonly t = this.i18n.t;
  protected readonly nameOf = (id: string, name?: string) => procedureName(this.t, id, name);

  protected readonly procedure = signal('');
  protected readonly price = signal('');
  protected readonly invalid = signal(false);
  protected readonly message = signal('');

  private readonly plan = computed(() => this.store.patientMap().get(this.appointment().patientId)?.plan ?? []);
  protected readonly done = computed(() => actsOfVisit(this.plan(), this.appointment().id));
  protected readonly planned = computed(() => plannedActs(this.plan()));
  protected readonly canRecord = computed(() => this.auth.can('clinical.create'));

  constructor() {
    effect(() => {
      const first = this.store.catalog()[0];
      if (first && !this.procedure()) untracked(() => this.pick(first.id));
    });
  }

  protected pick(id: string): void {
    this.procedure.set(id);
    this.price.set(String(this.store.catalog().find((e) => e.id === id)?.price ?? ''));
    this.invalid.set(false);
  }

  protected record(): void {
    const price = parsePrice(this.price());
    const entry = this.store.catalog().find((e) => e.id === this.procedure());
    if (price === null) { this.invalid.set(true); return; }
    if (!entry) return;
    const name = this.nameOf(entry.id, entry.name);
    const a = this.appointment();
    const next = recordVisitAct(this.plan(), { appointmentId: a.id, procedure: entry.id, name, price }, new Date());
    if (!next) return; // the same act was just recorded: a double click must not bill twice
    this.store.changePlan(a.patientId, () => next);
    this.message.set(this.t('va.recorded', { n: name }));
  }

  protected finish(id: string, procedure: string, name?: string): void {
    const a = this.appointment();
    const next = completePlanned(this.plan(), id, a.id, new Date());
    if (!next) return;
    this.store.changePlan(a.patientId, () => next);
    this.message.set(this.t('va.completed', { n: this.nameOf(procedure, name) }));
  }
}
