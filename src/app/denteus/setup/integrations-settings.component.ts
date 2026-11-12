import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { I18n, Key } from '../../core/i18n/i18n.service';
import { DentalStore } from '../services/dental-store.service';
import { Integration, IntegrationCategory, relevantIntegrations } from '../regional/integrations';
import { countryName } from '../regional/regional-rules';

const CATEGORIES: IntegrationCategory[] = ['insurance', 'government', 'payments', 'messaging', 'regional'];
const CAT_KEY: Record<IntegrationCategory, Key> = { insurance: 'int.cat.insurance', government: 'int.cat.government', payments: 'int.cat.payments', messaging: 'int.cat.messaging', regional: 'int.cat.regional' };

/** Settings → Insurance and integrations: optional services relevant to the clinic's country. None of them is needed to record a payment. */
@Component({
  selector: 'den-integrations-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="lead">{{ t('int.lead') }}</p>
    @if (!country()) { <p class="lead warn">{{ t('int.noCountry') }}</p> } @else { <p class="lead">{{ t('int.showing', { country: countryLabel() }) }}</p> }
    @for (g of groups(); track g.cat) {
      <section class="card" [attr.aria-labelledby]="'ig-' + g.cat">
        <header class="card-head"><h2 class="card-title" [id]="'ig-' + g.cat">{{ t(catKey[g.cat]) }}</h2></header>
        <ul class="list">
          @for (i of g.items; track i.id) {
            <li>
              <div class="grow"><strong>{{ t($any('int.' + i.id + '.name')) }}</strong><p>{{ t($any('int.' + i.id + '.text')) }}</p>
                <small>{{ i.countries === '*' ? t('int.everywhere') : t('int.only', { countries: names(i) }) }}</small></div>
              <span class="chip" [attr.data-tone]="i.status === 'builtIn' ? 'ok' : 'neutral'">{{ t(i.status === 'builtIn' ? 'int.status.builtIn' : 'int.status.planned') }}</span>
            </li>
          }
        </ul>
      </section>
    }
    <p class="lead">{{ t('int.secrets') }}</p>
  `,
  styles: `
    :host { display: contents; } .lead { margin: 0; padding: 12px 16px 0; color: var(--app-muted); line-height: 1.5; max-width: 72ch; } .warn { color: var(--app-text); }
    .list { list-style: none; margin: 0; padding: 0 16px 8px; } .list li { display: flex; gap: 16px; align-items: flex-start; padding: 14px 0; border-top: 1px solid var(--app-line); } .grow { flex: 1; } .list p { margin: 4px 0; color: var(--app-muted); line-height: 1.45; } small { color: var(--app-muted); }
  `,
})
export class IntegrationsSettingsComponent {
  private readonly store = inject(DentalStore);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly catKey = CAT_KEY;
  protected readonly country = computed(() => this.store.locations()[0]?.countryCode);
  protected readonly countryLabel = computed(() => (this.country() ? countryName(this.country()!, this.i18n.lang()) : ''));
  protected readonly groups = computed(() => { const list = relevantIntegrations(this.country()); return CATEGORIES.map((cat) => ({ cat, items: list.filter((i) => i.category === cat) })).filter((g) => g.items.length); });
  protected names(i: Integration): string { return i.countries === '*' ? '' : i.countries.map((c) => countryName(c, this.i18n.lang())).join(', '); }
}
