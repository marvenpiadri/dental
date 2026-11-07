import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { PublicClinic } from '../rules/public-record';
import { mapsLink } from '../rules/places-rules';

const L = {
  en: { call: 'Call', whatsapp: 'WhatsApp', directions: 'Get directions', about: 'About', services: 'Services', specialties: 'Specialties', hours: 'Opening hours', closed: 'Closed', languages: 'Languages spoken', gallery: 'Photographs', find: 'Find us', closures: 'Upcoming closures', temp: 'This clinic is temporarily closed.', email: 'Email', website: 'Website', draft: 'Preview. This page is not public yet.', from: 'Page by' },
  fr: { call: 'Appeler', whatsapp: 'WhatsApp', directions: 'Itinéraire', about: 'À propos', services: 'Soins', specialties: 'Spécialités', hours: 'Horaires', closed: 'Fermé', languages: 'Langues parlées', gallery: 'Photographies', find: 'Nous trouver', closures: 'Fermetures à venir', temp: 'Ce cabinet est temporairement fermé.', email: 'E-mail', website: 'Site web', draft: 'Aperçu. Cette page n\'est pas encore publique.', from: 'Page par' },
} as const;

const digits = (s: string): string => s.replace(/\D/g, '');

/** The public clinic page. It renders a PublicClinic only, so private data can't reach it. */
@Component({
  selector: 'den-clinic-page',
  templateUrl: './clinic-page.component.html',
  styleUrl: './clinic-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClinicPageComponent {
  readonly clinic = input.required<PublicClinic>();
  /** Preview shows inline images straight from the owner's browser; the public page uses the served image URLs. */
  readonly preview = input(false);
  readonly embed = input<string | undefined>();
  private readonly sanitizer = inject(DomSanitizer);
  // built by mapsEmbed from encoded parts on the google.com/maps/embed address only
  protected readonly frame = computed(() => { const e = this.embed(); return e ? this.sanitizer.bypassSecurityTrustResourceUrl(e) : null; });
  protected readonly l = computed(() => L[this.clinic().lang]);
  protected readonly tel = computed(() => { const p = this.clinic().phone; return p ? `tel:${p.replace(/[^\d+]/g, '')}` : null; });
  protected readonly wa = computed(() => { const w = this.clinic().whatsapp; return w && digits(w) ? `https://wa.me/${digits(w)}` : null; });
  protected readonly map = computed(() => mapsLink(this.clinic()));
  protected readonly cover = computed(() => { const c = this.clinic(); return c.cover ? (this.preview() ? c.cover : `${c.path}/img/cover`) : null; });
  protected readonly gallery = computed(() => { const c = this.clinic(); return c.gallery.map((g, i) => (this.preview() ? g : `${c.path}/img/${i}`)); });
  protected readonly place = computed(() => [this.clinic().city, this.clinic().country].filter(Boolean).join(', '));
  protected readonly days = computed(() => {
    const h = this.clinic().hours; const fmt = new Intl.DateTimeFormat(this.clinic().lang, { weekday: 'long', timeZone: 'UTC' });
    return [1, 2, 3, 4, 5, 6, 0].map((d) => ({ name: fmt.format(new Date(Date.UTC(2024, 0, 7 + d))), open: !!h?.days.includes(d) }));
  });
  protected readonly upcoming = computed(() => { const today = new Date().toISOString().slice(0, 10); return this.clinic().closures.filter((x) => x.to >= today); });
}
