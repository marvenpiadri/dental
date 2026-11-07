import { ChangeDetectionStrategy, Component, DOCUMENT, computed, effect, inject, input } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ClinicLocation } from '../models/dental.models';
import { jsonLd, seoDescription, seoTitle } from '../rules/clinic-profile-rules';
import { PublicLookup } from '../rules/public-record';
import { ClinicPageComponent } from './clinic-page.component';
import { SITE_ORIGIN } from './public-source';

/** `/clinics/{country}/{city}/{clinic}`: server-rendered for search engines, no sign-in. Metadata comes from the clinic's own confirmed data. */
@Component({
  selector: 'den-public-clinic',
  imports: [ClinicPageComponent],
  template: `
    @if (found(); as c) { <den-clinic-page [clinic]="c" /> }
    @else {
      <main class="gone"><h1>404</h1><p>This clinic page does not exist.</p><a href="https://dontalist.com">Dontalist</a></main>
    }`,
  styles: ':host{display:block} .gone{max-width:560px;margin:20vh auto;padding:0 16px} h1{font-size:4rem;margin:0}',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicClinicComponent {
  readonly lookup = input<PublicLookup>({ kind: 'none' });
  private readonly doc = inject(DOCUMENT);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);
  private readonly origin = inject(SITE_ORIGIN);
  protected readonly found = computed(() => { const l = this.lookup(); return l.kind === 'found' ? l.clinic : null; });

  constructor() {
    effect(() => {
      const c = this.found();
      const set = (name: string, content: string, attr: 'name' | 'property' = 'name') => this.meta.updateTag({ [attr]: name, content }, `${attr}="${name}"`);
      this.doc.querySelector('link[rel=canonical]')?.remove(); this.doc.getElementById('ld-clinic')?.remove();
      if (!c) { this.title.setTitle('Not found · Dontalist'); set('robots', 'noindex, nofollow'); return; }
      // Rebuild the location shape the SEO helpers expect from the public record: no private field is involved.
      const loc: ClinicLocation = { id: c.id, name: c.name, code: '', timezone: '', active: true, address: c.address, phone: c.phone, email: c.email, hours: c.hours,
        profile: { state: c.state, intro: c.intro, description: c.description, city: c.city, country: c.country, countryCode: c.countryCode, region: c.region, lat: c.lat, lng: c.lng, website: c.website, instagram: c.instagram, facebook: c.facebook, languages: c.languages, services: c.services } };
      const url = this.origin + c.path;
      const title = seoTitle(loc, c.lang), description = seoDescription(loc, c.lang), image = c.cover ? `${url}/img/cover` : undefined;
      this.title.setTitle(title);
      this.doc.documentElement.lang = c.lang;
      set('description', description); set('robots', 'index, follow');
      set('og:type', 'website', 'property'); set('og:title', title, 'property'); set('og:description', description, 'property'); set('og:url', url, 'property'); set('og:site_name', 'Dontalist', 'property');
      set('og:locale', c.lang === 'fr' ? 'fr_FR' : 'en_US', 'property');
      set('twitter:card', image ? 'summary_large_image' : 'summary');
      if (image) { set('og:image', image, 'property'); }
      const link = this.doc.createElement('link'); link.rel = 'canonical'; link.href = url; this.doc.head.appendChild(link);
      const ld = this.doc.createElement('script'); ld.type = 'application/ld+json'; ld.id = 'ld-clinic';
      ld.textContent = JSON.stringify(jsonLd(loc, url, image)).replace(/</g, '\\u003c'); this.doc.head.appendChild(ld);
    });
  }
}
