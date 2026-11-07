import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import { DentalStore } from '../services/dental-store.service';
import { MapsService } from '../services/maps.service';
import { mapsEmbed } from '../rules/places-rules';
import { publicRecord } from '../rules/public-record';
import { ClinicPageComponent } from './clinic-page.component';

/** What the public page will look like, from the clinic's current settings. Opens in its own tab; draft clinics can preview too. */
@Component({
  selector: 'den-clinic-preview',
  imports: [ClinicPageComponent],
  template: `@if (record(); as r) { <den-clinic-page [clinic]="r" [preview]="true" [embed]="embed()" /> } @else if (store.loaded()) { <p class="need">{{ t('prof.preview.need') }}</p> }`,
  styles: '.need{max-width:560px;margin:20vh auto;padding:0 16px}',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClinicPreviewComponent {
  protected readonly store = inject(DentalStore);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  private readonly maps = inject(MapsService);
  protected readonly record = computed(() => { const c = this.store.locations()[0]; return c ? publicRecord(c, this.i18n.lang() === 'fr' ? 'fr' : 'en') : null; });
  protected readonly embed = computed(() => { const r = this.record(); return r ? mapsEmbed(r, this.maps.key) : undefined; });
}
