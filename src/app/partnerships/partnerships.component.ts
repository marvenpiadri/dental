import { ChangeDetectionStrategy, Component, DOCUMENT, computed, effect, inject, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { I18n } from '../core/i18n/i18n.service';
import { ThemeService } from '../core/theme.service';
import { COPY } from './partnerships-copy';
import { APPLICANTS, Application, Field, PATHWAYS, Pathway, emptyApplication, fieldsFor, problems, required, toPayload } from './partnership-rules';

/** `/partnerships`: the Dontalist partnership page and application. Separate from the CRM page at `/`; the form only prepares a file, nothing is sent. */
@Component({
  selector: 'den-partnerships',
  imports: [RouterLink],
  templateUrl: './partnerships.component.html',
  styleUrl: './partnerships.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PartnershipsComponent {
  protected readonly i18n = inject(I18n);
  protected readonly themeService = inject(ThemeService);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly doc = inject(DOCUMENT);

  protected readonly c = computed(() => COPY[this.i18n.lang()]);
  protected readonly nextLang = computed(() => (this.i18n.lang() === 'en' ? 'fr' : 'en'));
  protected readonly pathways = PATHWAYS;
  protected readonly app = signal<Application>(emptyApplication('become'));
  protected readonly tried = signal(false);
  protected readonly ready = signal(false);
  protected readonly bad = computed(() => (this.tried() ? problems(this.app()) : []));
  protected readonly fields = computed(() => fieldsFor(this.app().pathway, this.app().applicant));
  protected readonly needed = computed(() => required(this.app().pathway, this.app().applicant));
  protected readonly applicants = computed(() => APPLICANTS[this.app().pathway]);
  protected readonly interests = computed(() => this.c().form.interestOptions[this.app().pathway]);

  constructor() {
    effect(() => {
      const c = this.c();
      this.title.setTitle(c.seoTitle);
      this.meta.updateTag({ name: 'description', content: c.seoDescription });
      this.meta.updateTag({ name: 'robots', content: 'index, follow' });
    });
  }

  protected scrollTo(id: string): void {
    const el = this.doc.getElementById(id);
    const calm = this.doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
  }

  /** The CTA of an offer: select that pathway and move to the form. */
  protected apply(p: Pathway): void { this.choose(p); this.scrollTo('apply'); }

  protected choose(p: Pathway): void {
    this.app.update((a) => ({ ...emptyApplication(p), name: a.name, email: a.email, phone: a.phone, country: a.country, city: a.city, message: a.message, consent: a.consent, applicant: APPLICANTS[p].includes(a.applicant as never) ? a.applicant : '' }));
    this.tried.set(false); this.ready.set(false);
  }

  protected set<K extends Field>(key: K, value: Application[K]): void { this.app.update((a) => ({ ...a, [key]: value })); }
  protected text(key: Field, e: Event): void { this.set(key, (e.target as HTMLInputElement).value as never); }
  protected toggle(option: string, on: boolean): void { this.app.update((a) => ({ ...a, interests: on ? [...a.interests, option] : a.interests.filter((x) => x !== option) })); }
  protected label(f: Field): string { return (this.c().form.f as Record<string, string>)[f] ?? ''; }
  protected value(f: Field): string { return String(this.app()[f]); }
  protected isBad(f: Field): boolean { return this.bad().includes(f); }
  protected isRequired(f: Field): boolean { return this.needed().includes(f); }

  protected submit(): void {
    this.tried.set(true);
    if (!problems(this.app()).length) { this.ready.set(true); this.doc.defaultView?.setTimeout(() => this.scrollTo('apply'), 0); }
  }

  protected download(): void {
    const view = this.doc.defaultView;
    if (!view) return;
    const body = JSON.stringify(toPayload(this.app(), new Date()), null, 2);
    const url = view.URL.createObjectURL(new Blob([body], { type: 'application/json' }));
    const a = this.doc.createElement('a');
    a.href = url; a.download = `${this.c().form.fileName}-${this.app().pathway}.json`;
    a.click();
    view.URL.revokeObjectURL(url);
  }

  protected restart(): void { this.choose(this.app().pathway); this.app.set(emptyApplication(this.app().pathway)); }
}
