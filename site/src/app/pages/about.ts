import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SiteService, pair } from '../core/site-service';

const copy = pair(
  { h1: 'About', intro: 'Dontalist builds software for dental clinics, and the services and partnerships that can grow around it.',
    now: { h2: 'Where it stands', items: [
      { h: 'The software is open', p: 'The Dontalist Dental Practice Management System covers patients, appointments, charting, treatment plans and billing, and runs at app.dontalist.com.', st: 'Available now' },
      { h: 'The rest is planned', p: 'Websites, search visibility, branding, professional networking and growth support are in development. They are shown as planned until they open.', st: 'Planned' },
    ] },
    how: { h2: 'How it is built', items: [
      { h: 'One account, one clinic', p: 'An account stands for a single clinic location, with its own team and its own patients.' },
      { h: 'Payments are recorded, not collected', p: 'The clinic records the payments it receives. Patients are never sent to an online checkout.' },
      { h: 'English and French', p: 'The software and this site work in both languages, on desktop and tablet.' },
    ] },
    contact: { p: 'To talk about co-branding, a franchise or the affiliate program, use the', link: 'partnership form' },
    attr: 'Attributions', lead: 'Dontalist’s 3D scenes stand on other people’s work. Here is whose.',
    items: [
      { h: 'Tooth anatomy', p: 'The teeth are derived from the ToothFairy3 dataset (case F_026), licensed under Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0). Surfaces were extracted, simplified and compressed, and a crown, root and pulp model was built for each tooth.', href: 'https://creativecommons.org/licenses/by-sa/4.0/', link: 'CC BY-SA 4.0' },
      { h: 'Implant, abutment and screw', p: 'The three parts are free-to-use 3D models whose author made them available for free use. They were converted, resized per tooth position and fitted together. The crown on each implant was built from the matching tooth above.', href: '', link: '' },
      { h: 'Software and type', p: 'The 3D scenes run on three.js (MIT licence). The typeface is Geist, by Vercel (SIL Open Font License 1.1).', href: '', link: '' },
    ] },
  { h1: 'À propos', intro: 'Dontalist crée des logiciels pour les cabinets dentaires, ainsi que les services et partenariats qui peuvent se développer autour.',
    now: { h2: 'Où nous en sommes', items: [
      { h: 'Le logiciel est ouvert', p: 'Le système de gestion de cabinet dentaire Dontalist couvre les patients, les rendez-vous, le charting, les plans de traitement et la facturation, et fonctionne sur app.dontalist.com.', st: 'Disponible' },
      { h: 'Le reste est prévu', p: 'Sites web, visibilité en ligne, image de marque, réseau professionnel et accompagnement de croissance sont en cours de développement. Ils restent affichés comme prévus tant qu’ils ne sont pas ouverts.', st: 'Prévu' },
    ] },
    how: { h2: 'Comment il est conçu', items: [
      { h: 'Un compte, un cabinet', p: 'Un compte correspond à un seul lieu d’exercice, avec son équipe et ses patients.' },
      { h: 'Les paiements sont enregistrés, pas encaissés', p: 'Le cabinet enregistre les paiements qu’il reçoit. Les patients ne sont jamais envoyés vers un paiement en ligne.' },
      { h: 'Français et anglais', p: 'Le logiciel et ce site fonctionnent dans les deux langues, sur ordinateur et tablette.' },
    ] },
    contact: { p: 'Pour parler de co-branding, de franchise ou du programme d’affiliation, utilisez le', link: 'formulaire partenariat' },
    attr: 'Crédits', lead: 'Les scènes 3D de Dontalist reposent sur le travail d’autres personnes. Voici lesquelles.',
    items: [
      { h: 'Anatomie des dents', p: 'Les dents sont issues du jeu de données ToothFairy3 (cas F_026), sous licence Creative Commons Attribution - Partage dans les mêmes conditions 4.0 (CC BY-SA 4.0). Les surfaces ont été extraites, simplifiées et compressées, et un modèle de couronne, de racine et de pulpe a été construit pour chaque dent.', href: 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr', link: 'CC BY-SA 4.0' },
      { h: 'Implant, pilier et vis', p: 'Ces trois pièces sont des modèles 3D en libre utilisation, mis à disposition gratuitement par leur auteur. Ils ont été convertis, redimensionnés selon la position de la dent et ajustés entre eux. La couronne de chaque implant a été construite à partir de la dent correspondante ci-dessus.', href: '', link: '' },
      { h: 'Logiciels et typographie', p: 'Les scènes 3D fonctionnent avec three.js (licence MIT). La typographie est Geist, de Vercel (SIL Open Font License 1.1).', href: '', link: '' },
    ] },
);

@Component({
  selector: 'ds-about', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="wrap about"><h1>{{ c().h1 }}</h1><p class="intro">{{ c().intro }}</p>
    <div class="grid"><h2>{{ c().now.h2 }}</h2><ul>@for (it of c().now.items; track it.h) { <li><h3>{{ it.h }}</h3><p>{{ it.p }}</p><p class="st">{{ it.st }}</p></li> }</ul></div>
    <div class="grid"><h2>{{ c().how.h2 }}</h2><ul>@for (it of c().how.items; track it.h) { <li><h3>{{ it.h }}</h3><p>{{ it.p }}</p></li> }</ul></div>
    <p class="contact">{{ c().contact.p }} <a class="link" [routerLink]="['/', lang(), 'partnership']" fragment="inquiry">{{ c().contact.link }}</a>.</p>
    <div id="attributions"><h2>{{ c().attr }}</h2><p class="lead">{{ c().lead }}</p>
      <ul class="credits">@for (it of c().items; track it.h) { <li><h3>{{ it.h }}</h3><p>{{ it.p }} @if (it.href) { <a class="link" [href]="it.href" target="_blank" rel="noopener">{{ it.link }}</a> }</p></li> }</ul>
    </div></section>`,
  styles: `.about { padding-block: calc(var(--bar) + 88px) 140px; } h1 { font-size: clamp(2.6rem, 6vw, 5.2rem); } .intro { margin-top: 24px; max-width: 52ch; color: var(--mute); font-size: 1.2rem; }
    h2 { font-size: clamp(1.8rem, 3vw, 2.6rem); } .grid { display: grid; grid-template-columns: 1fr 2fr; gap: 48px; margin-top: 88px; padding-top: 32px; border-top: 1px solid var(--rule); }
    ul { list-style: none; margin: 0; padding: 0; } .grid li { padding-bottom: 28px; } .grid li + li { padding-top: 28px; border-top: 1px solid var(--rule); } h3 { font-size: 1.35rem; margin-bottom: 8px; } .grid p { max-width: 58ch; color: var(--mute); } .st { margin-top: 10px; font: 500 14px/1 var(--mono); color: var(--ink) !important; }
    .contact { margin-top: 72px; } #attributions { margin-top: 96px; padding-top: 32px; border-top: 1px solid var(--rule); } .lead { margin-top: 12px; color: var(--mute); } .credits { margin-top: 32px; max-width: 70ch; } .credits li { padding-block: 20px; border-top: 1px solid var(--rule); } .credits p { color: var(--mute); }
    @media (max-width: 1100px) { .grid { grid-template-columns: 1fr; gap: 24px; } }`,
  imports: [RouterLink],
})
export class About { private readonly site = inject(SiteService); protected readonly c = this.site.pick(copy); protected readonly lang = this.site.lang; }
