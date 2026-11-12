import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { I18n, Key } from '../../core/i18n/i18n.service';
import { DentalStore } from '../services/dental-store.service';
import { PAYER_TYPES, Payer, PayerType, enabledTypes, payerInUse, payerProblem, suggestedPayers } from '../regional/payers';

const TYPE_KEY: Record<PayerType, Key> = { patient: 'payer.type.patient', public: 'payer.type.public', private: 'payer.type.private', mutual: 'payer.type.mutual', employer: 'payer.type.employer', other: 'payer.type.other' };
const TYPE_HINT: Record<PayerType, Key> = { patient: 'payer.hint.patient', public: 'payer.hint.public', private: 'payer.hint.private', mutual: 'payer.hint.mutual', employer: 'payer.hint.employer', other: 'payer.hint.other' };

/** Settings → Financial → Payers: who can pay the clinic, and the named insurers and mutuals it deals with. Recording these needs no integration. */
@Component({
  selector: 'den-payer-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="fs" [disabled]="!editable()">
      <section class="card" aria-labelledby="pt-title">
        <header class="card-head"><h2 class="card-title" id="pt-title"><i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i>{{ t('payer.types') }}</h2></header>
        <p class="intro hint">{{ t('payer.types.hint') }}</p>
        <ul class="types">
          @for (ty of allTypes; track ty) {
            <li><label class="check"><input type="checkbox" [checked]="types().includes(ty)" [disabled]="ty === 'patient'" (change)="toggleType(ty, $any($event.target).checked)" /><span><strong>{{ t(typeKey[ty]) }}</strong><small>{{ t(hintKey[ty]) }}</small></span></label></li>
          }
        </ul>
      </section>

      <section class="card" aria-labelledby="pd-title">
        <header class="card-head"><h2 class="card-title" id="pd-title"><i class="fa-solid fa-address-book" aria-hidden="true"></i>{{ t('payer.directory') }}</h2></header>
        <p class="intro hint">{{ t('payer.directory.hint') }}</p>
        @if (suggestions().length) {
          <p class="sugg">{{ t('payer.suggest', { names: suggestionNames() }) }} <button type="button" class="btn" (click)="addSuggested()">{{ t('payer.suggest.add') }}</button></p>
        }
        <form class="add" novalidate (submit)="$event.preventDefault(); add()">
          <label class="field"><span class="label">{{ t('payer.add.type') }}</span>
            <select class="input" (change)="newType.set($any($event.target).value)">
              @for (ty of namedTypes(); track ty) { <option [value]="ty" [selected]="newType() === ty">{{ t(typeKey[ty]) }}</option> }
            </select></label>
          <label class="field grow"><span class="label">{{ t('payer.add.name') }}</span>
            <input class="input" maxlength="80" [value]="newName()" [attr.aria-invalid]="problem() ? 'true' : null" (input)="newName.set($any($event.target).value)" /></label>
          <button type="submit" class="btn btn--primary"><i class="fa-solid fa-plus" aria-hidden="true"></i>{{ t('payer.add') }}</button>
        </form>
        @if (problem(); as p) { <p class="error" role="alert">{{ t(p === 'name' ? 'payer.err.name' : 'payer.err.duplicate') }}</p> }
        <ul class="rows">
          @for (p of payers(); track p.id) {
            <li [class.dim]="p.hidden">
              <span class="chip" data-tone="neutral">{{ t(typeKey[p.type]) }}</span>
              <span class="grow">{{ p.name }}@if (p.hidden) { <small> · {{ t('payer.hidden') }}</small> }</span>
              @if (used(p.id)) { <small>{{ t('payer.inUse') }}</small> }
              <button type="button" class="btn" (click)="hide(p)">{{ t(p.hidden ? 'payer.show' : 'payer.hide') }}</button>
              @if (!used(p.id)) { <button type="button" class="btn" (click)="remove(p)">{{ t('payer.remove') }}</button> }
            </li>
          } @empty { <li class="muted">{{ t('payer.none') }}</li> }
        </ul>
      </section>
    </fieldset>
  `,
  styles: `
    :host { display: contents; } .fs { display: contents; border: 0; padding: 0; margin: 0; }
    .types, .rows { list-style: none; margin: 0; padding: 0 16px 16px; } .types li, .rows li { padding: 10px 0; border-top: 1px solid var(--app-line); }
    .check { display: flex; gap: 10px; align-items: flex-start; } .check span { display: grid; gap: 2px; } .check small, small { color: var(--app-muted); }
    .rows li { display: flex; gap: 10px; align-items: center; } .grow { flex: 1; } .dim { opacity: .6; } .muted { color: var(--app-muted); }
    .add { display: flex; gap: 12px; align-items: end; flex-wrap: wrap; padding: 0 16px 12px; }
    .field { display: flex; flex-direction: column; gap: 4px; } .label { font-size: 13px; font-weight: 600; color: var(--app-muted); }
    .input { min-height: 44px; padding: 0 12px; border: 1px solid var(--app-field); border-radius: var(--radius-control, 8px); background: var(--app-panel); color: inherit; font: inherit; width: 100%; box-sizing: border-box; }
    .error { color: var(--app-danger); padding: 0 16px; margin: 0 0 8px; } .sugg { padding: 0 16px 12px; margin: 0; color: var(--app-muted); }
  `,
})
export class PayerSettingsComponent {
  private readonly store = inject(DentalStore);
  private readonly auth = inject(AuthService);
  protected readonly t = inject(I18n).t;
  protected readonly editable = computed(() => this.auth.can('settings.edit'));
  protected readonly allTypes = PAYER_TYPES;
  protected readonly typeKey = TYPE_KEY;
  protected readonly hintKey = TYPE_HINT;
  private readonly clinic = computed(() => this.store.locations()[0]);
  protected readonly types = computed(() => enabledTypes(this.clinic()?.payerTypes, this.clinic()?.countryCode));
  protected readonly namedTypes = computed(() => this.types().filter((x): x is Exclude<PayerType, 'patient'> => x !== 'patient'));
  protected readonly payers = computed(() => this.clinic()?.payers ?? []);
  protected readonly newType = signal<Exclude<PayerType, 'patient'>>('private');
  protected readonly newName = signal('');
  protected readonly tried = signal(false);
  protected readonly problem = computed(() => (this.tried() ? payerProblem({ id: '', type: this.newType(), name: this.newName() }, this.payers()) : null));
  protected readonly suggestions = computed(() => suggestedPayers(this.clinic()?.countryCode, this.payers(), () => crypto.randomUUID()));
  protected readonly suggestionNames = computed(() => this.suggestions().map((p) => p.name).join(', '));

  /** A payer is "in use" once any payment points at it: it can then only be hidden, never removed. */
  protected used(id: string): boolean { return payerInUse(id, this.store.patients().flatMap((p) => p.payments ?? [])); }

  protected async toggleType(ty: PayerType, on: boolean): Promise<void> {
    if (ty === 'patient') return;
    const next = PAYER_TYPES.filter((x) => x === 'patient' || (x === ty ? on : this.types().includes(x)));
    await this.store.patchClinic({ payerTypes: next });
  }

  protected async add(): Promise<void> {
    this.tried.set(true);
    const payer: Payer = { id: crypto.randomUUID(), type: this.newType(), name: this.newName().trim() };
    if (payerProblem(payer, this.payers())) return;
    await this.store.patchClinic({ payers: [...this.payers(), payer] });
    this.newName.set(''); this.tried.set(false);
  }

  protected async addSuggested(): Promise<void> {
    const types = new Set(this.types());
    const add = this.suggestions().filter((p) => types.has(p.type));
    const extra = this.suggestions().filter((p) => !types.has(p.type)).map((p) => p.type);
    await this.store.patchClinic({ payers: [...this.payers(), ...add], ...(extra.length ? { payerTypes: PAYER_TYPES.filter((x) => types.has(x) || extra.includes(x as never)) } : {}) });
  }

  protected async hide(p: Payer): Promise<void> { await this.store.patchClinic({ payers: this.payers().map((x) => (x.id === p.id ? { ...x, hidden: !x.hidden } : x)) }); }
  protected async remove(p: Payer): Promise<void> { if (!this.used(p.id)) await this.store.patchClinic({ payers: this.payers().filter((x) => x.id !== p.id) }); }
}
