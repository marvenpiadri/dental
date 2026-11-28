import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { API_URL, APP_URL } from '../core/site';
import { SiteService, pair } from '../core/site-service';

const PAGE = 15;
interface Item { id: string; name: string; intro: string | null; city: string; region: string | null; address: string | null; path: string }
interface Result { total: number; cities: string[]; items: Item[] }
const copy = pair(
  {
    h1: 'Find a clinic that runs on Dontalist.', lead: 'Clinics that subscribe to Dontalist are listed here. Each card opens the clinic’s own page.',
    city: 'City', allCities: 'All cities', search: 'Search by clinic or address', open: 'View clinic',
    prev: 'Previous', next: 'Next', showing: (a: number, b: number, n: number) => `Showing ${a} to ${b} of ${n}`,
    none: 'No clinics are listed yet.', noneP: 'Clinics that subscribe to Dontalist appear here.', cta: 'Become a Dontalist', noMatch: 'No clinic matches your search.',
    loading: 'Loading clinics', failed: 'The list could not be loaded.', retry: 'Try again',
  },
  {
    h1: 'Trouvez un cabinet qui fonctionne avec Dontalist.', lead: 'Les cabinets abonnés à Dontalist sont listés ici. Chaque carte ouvre la page du cabinet.',
    city: 'Ville', allCities: 'Toutes les villes', search: 'Rechercher un cabinet ou une adresse', open: 'Voir le cabinet',
    prev: 'Précédent', next: 'Suivant', showing: (a: number, b: number, n: number) => `Affichage de ${a} à ${b} sur ${n}`,
    none: 'Aucun cabinet n’est encore listé.', noneP: 'Les cabinets abonnés à Dontalist apparaissent ici.', cta: 'Devenir Dontalist', noMatch: 'Aucun cabinet ne correspond à votre recherche.',
    loading: 'Chargement des cabinets', failed: 'La liste n’a pas pu être chargée.', retry: 'Réessayer',
  },
);

@Component({
  selector: 'ds-clinics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <section class="wrap top"><h1>{{ c().h1 }}</h1><p class="lead">{{ c().lead }}</p></section>
    @if (cities().length) {
      <section class="wrap tools" aria-label="filters">
        <label><span>{{ c().city }}</span><select (change)="setCity($event)"><option value="">{{ c().allCities }}</option>@for (x of cities(); track x) { <option [value]="x" [selected]="x === city()">{{ x }}</option> }</select></label>
        <label class="grow"><span>{{ c().search }}</span><input type="search" maxlength="80" [value]="q()" (input)="setQ($event)" autocomplete="off"></label>
      </section>
    }
    <section class="wrap list" [attr.aria-busy]="state() === 'loading'">
      @switch (state()) {
        @case ('loading') { <p class="empty-s" role="status">{{ c().loading }}</p> }
        @case ('error') { <div class="empty"><p role="alert">{{ c().failed }}</p><button class="btn" type="button" (click)="load()">{{ c().retry }}</button></div> }
        @default {
          @if (!total() && !q() && !city()) {
            <div class="empty"><h2>{{ c().none }}</h2><p>{{ c().noneP }}</p><a class="btn btn--solid" [routerLink]="['/', lang(), 'partnership']" fragment="inquiry">{{ c().cta }}</a></div>
          } @else if (!items().length) {
            <p class="empty-s">{{ c().noMatch }}</p>
          } @else {
            <ul>@for (k of items(); track k.id) {
              <li>
                <span class="av" aria-hidden="true">{{ k.name.charAt(0).toUpperCase() }}</span>
                <div class="who"><h2><a [href]="app + k.path">{{ k.name }}</a></h2>@if (k.address) { <p>{{ k.address }}</p> }<p class="city">{{ k.city }}@if (k.region) { , {{ k.region }} }</p></div>
                <a class="btn" [href]="app + k.path" [attr.aria-label]="c().open + ': ' + k.name">{{ c().open }}</a>
              </li>
            }</ul>
            <nav class="pager" aria-label="pages"><p>{{ c().showing(from(), to(), total()) }}</p>
              <div><button class="btn" type="button" [disabled]="page() === 0" (click)="go(-1)">{{ c().prev }}</button><button class="btn" type="button" [disabled]="to() >= total()" (click)="go(1)">{{ c().next }}</button></div></nav>
          }
        }
      }
    </section>`,
  styles: `
    :host { display: block; } .top { padding-block: calc(var(--bar) + 88px) 48px; } h1 { font-size: clamp(2.4rem, 5.4vw, 4.6rem); max-width: 16ch; } .lead { margin-top: 20px; max-width: 54ch; color: var(--mute); font-size: 1.15rem; }
    .tools { display: flex; gap: 24px; padding-bottom: 32px; flex-wrap: wrap; } label { display: grid; gap: 6px; font-size: 15px; min-width: 220px; } label span { color: var(--mute); } .grow { flex: 1; }
    select, input { font: inherit; color: var(--ink); background: var(--bg); border: 0; border-bottom: 1px solid var(--rule); border-radius: 0; padding: 10px 0; width: 100%; } select:focus-visible, input:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .list { padding-bottom: 140px; min-height: 40vh; } ul { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--rule); }
    li { display: grid; grid-template-columns: 64px 1fr auto; gap: 24px; align-items: center; padding-block: 24px; border-bottom: 1px solid var(--rule); }
    .av { width: 64px; height: 64px; border-radius: 50%; background: var(--bg2); display: grid; place-items: center; font: 400 1.5rem var(--display); }
    .who h2 { font: 500 1.25rem/1.25 var(--sans); letter-spacing: -.01em; } .who h2 a { text-decoration: none; } .who h2 a:hover { text-decoration: underline; text-underline-offset: 4px; } .who p { color: var(--mute); font-size: 15px; } .city { color: var(--ink) !important; }
    .pager { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding-top: 28px; flex-wrap: wrap; } .pager p { color: var(--mute); } .pager div { display: flex; gap: 12px; } .btn[disabled] { opacity: .4; pointer-events: none; }
    .empty { max-width: 46ch; padding-block: 24px; display: grid; gap: 14px; justify-items: start; } .empty h2 { font-size: clamp(1.6rem, 3vw, 2.4rem); } .empty p, .empty-s { color: var(--mute); }`,
})
export class Clinics {
  private readonly site = inject(SiteService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly c = this.site.pick(copy);
  protected readonly lang = this.site.lang;
  protected readonly app = APP_URL;
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly items = signal<Item[]>([]);
  protected readonly cities = signal<string[]>([]);
  protected readonly total = signal(0);
  protected readonly city = signal(''); protected readonly q = signal(''); protected readonly page = signal(0);
  protected readonly from = () => this.page() * PAGE + 1;
  protected readonly to = () => Math.min(this.total(), this.page() * PAGE + PAGE);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private seq = 0;

  constructor() { if (this.browser) void this.load(); }

  /** Filtering and paging happen in the database; the page only ever holds one page of results. The latest request wins. */
  protected async load(): Promise<void> {
    const n = ++this.seq; this.state.set('loading');
    const u = new URL('/v1/public/clinics', API_URL); u.searchParams.set('limit', String(PAGE)); u.searchParams.set('offset', String(this.page() * PAGE));
    if (this.city()) u.searchParams.set('city', this.city()); if (this.q().trim()) u.searchParams.set('q', this.q().trim());
    try {
      const r = await fetch(u); if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as Result; if (n !== this.seq) return;
      this.items.set(j.items); this.total.set(j.total); if (!this.city() && !this.q().trim()) this.cities.set(j.cities); this.state.set('ready');
    } catch { if (n === this.seq) this.state.set('error'); }
  }
  protected setCity(e: Event): void { this.city.set((e.target as HTMLSelectElement).value); this.page.set(0); void this.load(); }
  protected setQ(e: Event): void { this.q.set((e.target as HTMLInputElement).value); this.page.set(0); clearTimeout(this.timer); this.timer = setTimeout(() => void this.load(), 300); }
  protected go(d: number): void { this.page.update((p) => p + d); scrollTo({ top: 0 }); void this.load(); }
}
