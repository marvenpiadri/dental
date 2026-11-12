import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { I18n } from '../../core/i18n/i18n.service';
import { DentalStore } from '../services/dental-store.service';
import { PlacePickerComponent } from '../regional/place-picker.component';
import { TIMEZONES, countryOf, currencies, formatMoney, timeZones } from '../regional/regional-rules';

/** Settings → Location and regional: where the clinic is, and what follows from it (currency, time zone, formats). One source for the rest of the app. */
@Component({
  selector: 'den-location-settings',
  imports: [PlacePickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="fs" [disabled]="!editable()">
      <section class="card" aria-labelledby="loc-title">
        <header class="card-head"><h2 class="card-title" id="loc-title"><i class="fa-solid fa-location-dot" aria-hidden="true"></i>{{ t('loc.where') }}</h2></header>
        <p class="intro hint">{{ t('loc.where.hint') }}</p>
        <div class="grid">
          <den-place-picker kind="country" [label]="t('loc.country')" [value]="clinic()?.countryCode" [disabled]="!editable()" (changed)="setCountry($event)" />
          <den-place-picker kind="city" [label]="t('loc.city')" [country]="clinic()?.countryCode" [value]="clinic()?.city" [disabled]="!editable()" (changed)="save({ city: $event || undefined })" />
          <label class="field wide"><span class="label">{{ t('set.address') }}</span><input class="input" maxlength="160" [value]="clinic()?.address ?? ''" autocomplete="street-address" (change)="save({ address: $any($event.target).value.trim() || undefined })" /></label>
          <label class="field"><span class="label">{{ t('loc.postal') }}</span><input class="input" maxlength="20" [value]="clinic()?.postalCode ?? ''" autocomplete="postal-code" (change)="save({ postalCode: $any($event.target).value.trim() || undefined })" /></label>
          @if (country(); as c) { <p class="note">{{ t('loc.phonePrefix', { prefix: c.phone || '—' }) }}</p> }
        </div>
      </section>

      <section class="card" aria-labelledby="reg-title">
        <header class="card-head"><h2 class="card-title" id="reg-title"><i class="fa-solid fa-earth-africa" aria-hidden="true"></i>{{ t('loc.regional') }}</h2></header>
        <div class="grid">
          <label class="field"><span class="label">{{ t('loc.timezone') }}</span>
            <select class="input" (change)="save({ timezone: $any($event.target).value })">
              @for (z of zones(); track z) { <option [value]="z" [selected]="clinic()?.timezone === z">{{ z }}</option> }
            </select></label>
          <label class="field"><span class="label">{{ t('loc.currency') }}</span>
            <select class="input" (change)="requestCurrency($any($event.target).value)">
              @for (c of allCurrencies; track c) { <option [value]="c" [selected]="store.currency() === c">{{ c }}</option> }
            </select></label>
        </div>
        @if (suggestion(); as s) {
          <p class="note">{{ t('loc.currency.suggest', { currency: s }) }}</p>
        }
        @if (pending(); as next) {
          <div class="confirm" role="alertdialog" aria-labelledby="cur-q">
            <h3 id="cur-q">{{ t('loc.currency.confirm', { from: store.currency(), to: next }) }}</h3>
            <p>{{ t('loc.currency.explain', { from: store.currency(), to: next }) }}</p>
            <div class="row"><button type="button" class="btn btn--primary" (click)="applyCurrency(next)">{{ t('loc.currency.switch', { to: next }) }}</button><button type="button" class="btn" (click)="pending.set(null)">{{ t('loc.currency.keep', { from: store.currency() }) }}</button></div>
          </div>
        }
        <p class="note">{{ t('loc.preview') }}: <strong>{{ sample() }}</strong> · <strong>{{ sampleDate() }}</strong></p>
      </section>
    </fieldset>
  `,
  styles: `
    :host { display: contents; } .fs { display: contents; border: 0; padding: 0; margin: 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; padding: 0 16px 16px; } .wide { grid-column: 1 / -1; }
    .field { display: flex; flex-direction: column; gap: 4px; } .label { font-size: 13px; font-weight: 600; color: var(--app-muted); }
    .input { width: 100%; box-sizing: border-box; min-height: 44px; padding: 0 12px; border: 1px solid var(--app-field); border-radius: var(--radius-control, 8px); background: var(--app-panel); color: inherit; font: inherit; }
    .note { margin: 0; padding: 0 16px 16px; color: var(--app-muted); font-size: 13px; } .grid .note { padding: 0; align-self: end; }
    .confirm { margin: 0 16px 16px; padding: 16px; border: 1px solid var(--app-warn, #b7791f); border-radius: 8px; } .confirm h3 { margin: 0 0 6px; font-size: 1rem; } .confirm p { margin: 0 0 12px; color: var(--app-muted); line-height: 1.5; } .row { display: flex; gap: 8px; flex-wrap: wrap; }
  `,
})
export class LocationSettingsComponent {
  protected readonly store = inject(DentalStore);
  private readonly auth = inject(AuthService);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly editable = computed(() => this.auth.can('profile.edit'));
  protected readonly clinic = computed(() => this.store.locations()[0]);
  protected readonly country = computed(() => countryOf(this.clinic()?.countryCode));
  protected readonly allCurrencies = currencies();
  protected readonly zones = computed(() => { const z = timeZones(); const own = this.clinic()?.timezone; return own && !z.includes(own) ? [own, ...z] : z; });
  protected readonly pending = signal<string | null>(null);
  protected readonly sample = computed(() => formatMoney(1500, this.store.currency(), this.i18n.lang()) + ' / ' + formatMoney(1500.5, this.store.currency(), this.i18n.lang()));
  protected readonly sampleDate = computed(() => this.i18n.date(new Date(2026, 10, 28), { dateStyle: 'long' }));
  /** The country's usual currency, when the clinic is using another one. */
  protected readonly suggestion = computed(() => { const c = this.country()?.currency; return c && c !== this.store.currency() && this.pending() !== c ? c : null; });

  protected async save(patch: Parameters<DentalStore['patchClinic']>[0]): Promise<void> { if (this.editable()) await this.store.patchClinic(patch); }

  /** Picking a country sets its main time zone when there is one, and its currency: at once for a clinic with no money records yet, after confirmation otherwise. */
  protected async setCountry(code: string): Promise<void> {
    if (!code) return void (await this.save({ countryCode: undefined }));
    const tz = TIMEZONES[code];
    await this.save({ countryCode: code, ...(tz ? { timezone: tz } : {}) });
    const currency = countryOf(code)?.currency;
    if (currency) await this.requestCurrency(currency);
  }

  protected async requestCurrency(next: string): Promise<void> {
    if (!next || next === this.store.currency()) { this.pending.set(null); return; }
    if (this.store.hasFinancialRecords()) this.pending.set(next);
    else await this.applyCurrency(next);
  }

  protected async applyCurrency(next: string): Promise<void> { this.pending.set(null); await this.store.changeCurrency(next); }
}
