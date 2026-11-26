import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SiteService, pair } from '../core/site-service';

const copy = pair(
  { h1: 'About', attr: 'Attributions', lead: 'Dontalist’s 3D scenes stand on other people’s work. Here is whose.',
    items: [
      { h: 'Tooth anatomy', p: 'The teeth are derived from the ToothFairy3 dataset (case F_026), licensed under Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0). Surfaces were extracted, simplified and compressed, and a crown, root and pulp model was built for each tooth.', href: 'https://creativecommons.org/licenses/by-sa/4.0/', link: 'CC BY-SA 4.0' },
      { h: 'Implant, abutment and screw', p: 'The three parts are free-to-use 3D models whose author made them available for free use. They were converted, resized per tooth position and fitted together. The crown on each implant was built from the matching tooth above.', href: '', link: '' },
      { h: 'Software and type', p: 'The 3D scenes run on three.js (MIT licence). The typeface is Geist, by Vercel (SIL Open Font License 1.1).', href: '', link: '' },
    ] },
  { h1: 'À propos', attr: 'Crédits', lead: 'Les scènes 3D de Dontalist reposent sur le travail d’autres personnes. Voici lesquelles.',
    items: [
      { h: 'Anatomie des dents', p: 'Les dents sont issues du jeu de données ToothFairy3 (cas F_026), sous licence Creative Commons Attribution - Partage dans les mêmes conditions 4.0 (CC BY-SA 4.0). Les surfaces ont été extraites, simplifiées et compressées, et un modèle de couronne, de racine et de pulpe a été construit pour chaque dent.', href: 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr', link: 'CC BY-SA 4.0' },
      { h: 'Implant, pilier et vis', p: 'Ces trois pièces sont des modèles 3D en libre utilisation, mis à disposition gratuitement par leur auteur. Ils ont été convertis, redimensionnés selon la position de la dent et ajustés entre eux. La couronne de chaque implant a été construite à partir de la dent correspondante ci-dessus.', href: '', link: '' },
      { h: 'Logiciels et typographie', p: 'Les scènes 3D fonctionnent avec three.js (licence MIT). La typographie est Geist, de Vercel (SIL Open Font License 1.1).', href: '', link: '' },
    ] },
);

@Component({
  selector: 'ds-about', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="wrap about"><h1>{{ c().h1 }}</h1>
    <div id="attributions"><h2>{{ c().attr }}</h2><p class="lead">{{ c().lead }}</p>
      <ul>@for (it of c().items; track it.h) { <li><h3>{{ it.h }}</h3><p>{{ it.p }} @if (it.href) { <a class="link" [href]="it.href" target="_blank" rel="noopener">{{ it.link }}</a> }</p></li> }</ul>
    </div></section>`,
  styles: `.about { padding-block: calc(var(--bar) + 80px) 120px; } h2 { margin-top: 64px; font-size: clamp(1.8rem, 3vw, 2.6rem); } .lead { margin-top: 12px; color: var(--mute); } ul { list-style: none; margin: 32px 0 0; padding: 0; max-width: 70ch; } li { padding-block: 22px; border-top: 1px solid var(--rule); } li h3 { font-family: var(--sans); font-weight: 600; font-size: 1.1rem; letter-spacing: 0; } li p { margin-top: 8px; color: var(--mute); }`,
})
export class About { protected readonly c = inject(SiteService).pick(copy); }
