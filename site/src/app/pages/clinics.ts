import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CLINICS, type Clinic } from '../core/clinics';
import { SiteService, pair } from '../core/site-service';

const PAGE = 15;
const copy = pair(
  {
    h1: 'Find a clinic that runs on Dontalist.', lead: 'Clinics that subscribe to Dontalist are listed here. Each one links to its own page.',
    city: 'City', allCities: 'All cities', search: 'Search by clinic or address', open: 'View clinic', opens: 'Opens the clinic’s own page in a new tab',
    prev: 'Previous', next: 'Next', showing: (a: number, b: number, n: number) => `Showing ${a} to ${b} of ${n}`,
    none: 'No clinics are listed yet.', noneP: 'Clinics that subscribe to Dontalist appear here.', cta: 'Become a Dontalist', noMatch: 'No clinic matches your search.',
  },
  {
    h1: 'Trouvez un cabinet qui fonctionne avec Dontalist.', lead: 'Les cabinets abonnés à Dontalist sont listés ici. Chacun renvoie vers sa propre page.',
    city: 'Ville', allCities: 'Toutes les villes', search: 'Rechercher un cabinet ou une adresse', open: 'Voir le cabinet', opens: 'Ouvre la page du cabinet dans un nouvel onglet',
    prev: 'Précédent', next: 'Suivant', showing: (a: number, b: number, n: number) => `Affichage de ${a} à ${b} sur ${n}`,
    none: 'Aucun cabinet n’est encore listé.', noneP: 'Les cabinets abonnés à Dontalist apparaissent ici.', cta: 'Devenir Dontalist', noMatch: 'Aucun cabinet ne correspond à votre recherche.',
  },
);
const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

@Component({
  selector: 'ds-clinics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <section class="wrap top"><h1>{{ c().h1 }}</h1><p class="lead">{{ c().lead }}</p></section>
    @if (all.length) {
      <section class="wrap tools" aria-label="filters">
        <label><span>{{ c().city }}</span><select (change)="setCity($event)"><option value="">{{ c().allCities }}</option>@for (x of cities; track x) { <option [value]="x" [selected]="x === city()">{{ x }}</option> }</select></label>
        <label class="grow"><span>{{ c().search }}</span><input type="search" [value]="q()" (input)="setQ($event)" autocomplete="off"></label>
      </section>
    }
    <section class="wrap list">
      @if (!all.length) {
        <div class="empty"><h2>{{ c().none }}</h2><p>{{ c().noneP }}</p><a class="btn btn--solid" [routerLink]="['/', lang(), 'partnership']" fragment="inquiry">{{ c().cta }}</a></div>
      } @else if (!hits().length) {
        <p class="empty-s">{{ c().noMatch }}</p>
      } @else {
        <ul>@for (k of visible(); track k.id) {
          <li>
            <span class="av" aria-hidden="true">@if (k.photo) { <img [src]="k.photo" alt="" width="64" height="64" loading="lazy"> } @else { {{ initial(k) }} }</span>
            <div class="who"><h2><a [href]="k.url" target="_blank" rel="noopener">{{ k.name }}</a></h2><p>{{ k.address }}</p><p class="city">{{ k.city }}</p></div>
            <a class="btn" [href]="k.url" target="_blank" rel="noopener" [attr.aria-label]="c().open + ': ' + k.name + '. ' + c().opens">{{ c().open }}</a>
          </li>
        }</ul>
        <nav class="pager" aria-label="pages"><p>{{ c().showing(from(), to(), hits().length) }}</p>
          <div><button class="btn" type="button" [disabled]="page() === 0" (click)="go(-1)">{{ c().prev }}</button><button class="btn" type="button" [disabled]="to() >= hits().length" (click)="go(1)">{{ c().next }}</button></div></nav>
      }
    </section>`,
  styles: `
    :host { display: block; } .top { padding-block: calc(var(--bar) + 88px) 48px; } h1 { font-size: clamp(2.4rem, 5.4vw, 4.6rem); max-width: 16ch; } .lead { margin-top: 20px; max-width: 54ch; color: var(--mute); font-size: 1.15rem; }
    .tools { display: flex; gap: 24px; padding-bottom: 32px; flex-wrap: wrap; } label { display: grid; gap: 6px; font-size: 15px; min-width: 220px; } label span { color: var(--mute); } .grow { flex: 1; }
    select, input { font: inherit; color: var(--ink); background: var(--bg); border: 0; border-bottom: 1px solid var(--rule); border-radius: 0; padding: 10px 0; width: 100%; } select:focus-visible, input:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .list { padding-bottom: 140px; min-height: 40vh; } ul { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--rule); }
    li { display: grid; grid-template-columns: 64px 1fr auto; gap: 24px; align-items: center; padding-block: 24px; border-bottom: 1px solid var(--rule); }
    .av { width: 64px; height: 64px; border-radius: 50%; background: var(--bg2); display: grid; place-items: center; font: 400 1.5rem var(--display); overflow: hidden; } .av img { width: 100%; height: 100%; object-fit: cover; }
    .who h2 { font: 500 1.25rem/1.25 var(--sans); letter-spacing: -.01em; } .who h2 a { text-decoration: none; } .who h2 a:hover { text-decoration: underline; text-underline-offset: 4px; } .who p { color: var(--mute); font-size: 15px; } .city { color: var(--ink) !important; }
    .pager { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding-top: 28px; flex-wrap: wrap; } .pager p { color: var(--mute); } .pager div { display: flex; gap: 12px; } .btn[disabled] { opacity: .4; pointer-events: none; }
    .empty { max-width: 46ch; padding-block: 24px; display: grid; gap: 14px; justify-items: start; } .empty h2 { font-size: clamp(1.6rem, 3vw, 2.4rem); } .empty p, .empty-s { color: var(--mute); }`,
})
export class Clinics {
  private readonly site = inject(SiteService);
  protected readonly c = this.site.pick(copy);
  protected readonly lang = this.site.lang;
  protected readonly all = CLINICS;
  protected readonly cities = [...new Set(CLINICS.map((k) => k.city))].sort((a, b) => a.localeCompare(b));
  protected readonly city = signal(''); protected readonly q = signal(''); protected readonly page = signal(0);
  protected readonly hits = computed(() => { const q = plain(this.q().trim()), city = this.city(); return this.all.filter((k) => (!city || k.city === city) && (!q || plain(`${k.name} ${k.address} ${k.city}`).includes(q))); });
  protected readonly visible = computed(() => this.hits().slice(this.page() * PAGE, this.page() * PAGE + PAGE));
  protected readonly from = computed(() => this.page() * PAGE + 1);
  protected readonly to = computed(() => Math.min(this.hits().length, this.page() * PAGE + PAGE));
  protected initial(k: Clinic): string { return k.name.trim().charAt(0).toUpperCase(); }
  protected setCity(e: Event): void { this.city.set((e.target as HTMLSelectElement).value); this.page.set(0); }
  protected setQ(e: Event): void { this.q.set((e.target as HTMLInputElement).value); this.page.set(0); }
  protected go(d: number): void { this.page.update((p) => p + d); scrollTo({ top: 0 }); }
}
