import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { INQUIRY_ENDPOINT } from '../core/site';
import { SiteService, pair } from '../core/site-service';

/** Only what has been discussed and confirmed: the three royalty levels, the co-branding name, the optional/independent rules. Inclusions per level are agreed in conversation. */
const copy = pair(
  {
    h1: 'Stay independent, or build with Dontalist.',
    lead: 'There are three ways to work with us beyond the software: put our name beside yours, build under our brand, or distribute products as an affiliate. Each one is optional, and the software never depends on any of them.',
    offers: {
      h2: 'The offers',
      items: [
        { id: 'cobranding', h: 'Co-branding', p: 'Your clinic keeps its own identity and adds Dontalist’s endorsement. The two names sit together, in the pattern Dontalist: [your clinic].', tag: 'Dontalist: Your Clinic' },
        { id: 'franchise', h: 'Franchise', p: 'A full franchise: the clinic operates primarily under the Dontalist brand. There are three levels, set by the royalty.', tag: '' },
        { id: 'affiliates', h: 'Affiliates', p: 'A separate program for digital and physical products: product sales, distribution and affiliate partnerships. Its details are still being defined.', tag: '' },
      ],
    },
    levels: {
      h2: 'Franchise levels',
      lead: 'The royalty is the difference we can state today. What each level includes, how the royalty is calculated and what it costs to start are set out when you get in touch.',
      royalty: 'royalty', items: [{ h: 'Level 1', r: '3%' }, { h: 'Level 2', r: '6%' }, { h: 'Level 3', r: '8%' }],
    },
    shared: {
      h2: 'What stays true in every offer',
      items: [
        { h: 'Optional', p: 'Nothing here is required to use Dontalist. The software stands on its own.' },
        { h: 'Independent of the software', p: 'You do not need to use the software to take an offer, and an offer does not change what the software costs or does.' },
        { h: 'Built on the network', p: 'Co-branding and the franchise draw on Dontalist’s marketing, branding and professional network. Parts of that network are still in development.' },
      ],
    },
    form: {
      h2: 'Tell us what you have in mind.', lead: 'We reply personally. Contract terms are discussed once we have spoken.',
      name: 'Your name', clinic: 'Clinic or practice name', city: 'City', contact: 'Email or phone', interest: 'What interests you',
      options: [['', 'Choose one'], ['cobranding', 'Co-branding'], ['franchise-1', 'Franchise, level 1'], ['franchise-2', 'Franchise, level 2'], ['franchise-3', 'Franchise, level 3'], ['affiliates', 'Affiliates'], ['unsure', 'Not sure yet']],
      message: 'Anything we should know', send: 'Send', sending: 'Sending…',
      sent: 'Thank you. We have your message and will reply to you directly.',
      off: 'This form cannot send yet. Please come back soon.',
      error: 'The message was not sent. Check your connection and try again.',
    },
  },
  {
    h1: 'Restez indépendant, ou construisez avec Dontalist.',
    lead: 'Au-delà du logiciel, il y a trois façons de travailler avec nous : mettre notre nom à côté du vôtre, construire sous notre marque, ou distribuer des produits comme affilié. Chaque option est facultative, et le logiciel ne dépend d’aucune d’entre elles.',
    offers: {
      h2: 'Les offres',
      items: [
        { id: 'cobranding', h: 'Co-branding', p: 'Votre cabinet garde sa propre identité et y ajoute le soutien de Dontalist. Les deux noms s’affichent ensemble, sur le modèle Dontalist : [votre cabinet].', tag: 'Dontalist : Votre cabinet' },
        { id: 'franchise', h: 'Franchise', p: 'Une franchise complète : le cabinet exerce principalement sous la marque Dontalist. Il y a trois niveaux, définis par la redevance.', tag: '' },
        { id: 'affiliates', h: 'Affiliation', p: 'Un programme distinct pour les produits numériques et physiques : vente de produits, distribution et partenariats d’affiliation. Ses détails sont encore en cours de définition.', tag: '' },
      ],
    },
    levels: {
      h2: 'Les niveaux de franchise',
      lead: 'La redevance est la différence que nous pouvons annoncer aujourd’hui. Ce que comprend chaque niveau, le calcul de la redevance et le coût de démarrage sont précisés lorsque vous nous contactez.',
      royalty: 'de redevance', items: [{ h: 'Niveau 1', r: '3 %' }, { h: 'Niveau 2', r: '6 %' }, { h: 'Niveau 3', r: '8 %' }],
    },
    shared: {
      h2: 'Ce qui reste vrai dans chaque offre',
      items: [
        { h: 'Facultatif', p: 'Rien ici n’est nécessaire pour utiliser Dontalist. Le logiciel se suffit à lui-même.' },
        { h: 'Indépendant du logiciel', p: 'Vous n’avez pas besoin du logiciel pour choisir une offre, et une offre ne change ni le prix ni le fonctionnement du logiciel.' },
        { h: 'Appuyé sur le réseau', p: 'Le co-branding et la franchise s’appuient sur le marketing, la marque et le réseau professionnel de Dontalist. Une partie de ce réseau est encore en développement.' },
      ],
    },
    form: {
      h2: 'Dites-nous ce que vous avez en tête.', lead: 'Nous répondons personnellement. Les conditions du contrat se discutent une fois que nous avons échangé.',
      name: 'Votre nom', clinic: 'Nom du cabinet', city: 'Ville', contact: 'E-mail ou téléphone', interest: 'Ce qui vous intéresse',
      options: [['', 'Choisir'], ['cobranding', 'Co-branding'], ['franchise-1', 'Franchise, niveau 1'], ['franchise-2', 'Franchise, niveau 2'], ['franchise-3', 'Franchise, niveau 3'], ['affiliates', 'Affiliation'], ['unsure', 'Je ne sais pas encore']],
      message: 'Ce que nous devrions savoir', send: 'Envoyer', sending: 'Envoi…',
      sent: 'Merci. Nous avons bien reçu votre message et vous répondrons directement.',
      off: 'Ce formulaire ne peut pas encore envoyer de message. Revenez bientôt.',
      error: 'Le message n’a pas été envoyé. Vérifiez votre connexion et réessayez.',
    },
  },
);

@Component({
  selector: 'ds-partnership',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="top wrap"><h1>{{ c().h1 }}</h1><p class="lead">{{ c().lead }}</p></section>

    <section class="wrap offers" aria-labelledby="offers-h">
      <h2 id="offers-h">{{ c().offers.h2 }}</h2>
      <ul>@for (o of c().offers.items; track o.id) {
        <li [id]="o.id"><h3>{{ o.h }}</h3><div><p>{{ o.p }}</p>@if (o.tag) { <p class="tag">{{ o.tag }}</p> }</div></li>
      }</ul>
    </section>

    <section class="levels dark-zone" aria-labelledby="levels-h">
      <div class="wrap">
        <h2 id="levels-h">{{ c().levels.h2 }}</h2><p class="lead">{{ c().levels.lead }}</p>
        <ol>@for (l of c().levels.items; track l.h) { <li><span class="r">{{ l.r }}</span><span class="n">{{ l.h }}</span><span class="u">{{ c().levels.royalty }}</span></li> }</ol>
      </div>
    </section>

    <section class="wrap shared" aria-labelledby="shared-h">
      <h2 id="shared-h">{{ c().shared.h2 }}</h2>
      <ul>@for (s of c().shared.items; track s.h) { <li><h3>{{ s.h }}</h3><p>{{ s.p }}</p></li> }</ul>
    </section>

    <section class="wrap inquiry" id="inquiry" aria-labelledby="inq-h">
      <div class="head"><h2 id="inq-h">{{ c().form.h2 }}</h2><p class="lead">{{ c().form.lead }}</p></div>
      <form (submit)="send($event)" novalidate>
        <label><span>{{ c().form.name }}</span><input name="name" required autocomplete="name"></label>
        <label><span>{{ c().form.clinic }}</span><input name="clinic" autocomplete="organization"></label>
        <label><span>{{ c().form.city }}</span><input name="city" autocomplete="address-level2"></label>
        <label><span>{{ c().form.contact }}</span><input name="contact" required autocomplete="email"></label>
        <label class="wide"><span>{{ c().form.interest }}</span>
          <select name="interest">@for (o of c().form.options; track o[0]) { <option [value]="o[0]">{{ o[1] }}</option> }</select></label>
        <label class="wide"><span>{{ c().form.message }}</span><textarea name="message" rows="4" maxlength="2000"></textarea></label>
        <input class="trap" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <div class="wide act"><button class="btn btn--solid" type="submit" [disabled]="state() === 'sending'">{{ state() === 'sending' ? c().form.sending : c().form.send }}</button>
          <p class="status" role="status">@switch (state()) { @case ('sent') { {{ c().form.sent }} } @case ('off') { {{ c().form.off }} } @case ('error') { {{ c().form.error }} } }</p></div>
      </form>
    </section>`,
  styles: `
    :host { display: block; }
    .top { padding-block: calc(var(--bar) + 88px) 72px; } .top h1 { font-size: clamp(2.6rem, 6vw, 5.2rem); max-width: 14ch; } .lead { margin-top: 24px; max-width: 58ch; color: var(--mute); font-size: 1.15rem; }
    h2 { font-size: clamp(1.8rem, 3.2vw, 2.8rem); }
    .offers { padding-bottom: 96px; } ul, ol { list-style: none; margin: 0; padding: 0; }
    .offers ul { margin-top: 40px; border-top: 1px solid var(--rule); }
    .offers li { display: grid; grid-template-columns: minmax(180px, 1fr) 2fr; gap: 32px; padding-block: 36px; border-bottom: 1px solid var(--rule); scroll-margin-top: calc(var(--bar) + 24px); }
    .offers h3 { font-size: clamp(1.6rem, 2.4vw, 2.2rem); } .offers p { max-width: 58ch; } .offers .tag { display: block; width: fit-content; margin: 14px auto 0 0; font: 500 15px/1.2 var(--mono); color: var(--ink); }
    .levels { padding-block: 96px; } .levels .lead { color: var(--mute); }
    .levels ol { margin-top: 48px; display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--rule); }
    .levels li { display: grid; gap: 4px; padding: 32px 28px 8px 0; } .levels li + li { padding-left: 28px; border-left: 1px solid var(--rule); }
    .r { font: 300 clamp(3.4rem, 8vw, 7rem)/1 var(--display); letter-spacing: -.06em; } .n { font-size: 1.15rem; } .u { color: var(--mute); }
    .shared { padding-block: 96px; } .shared ul { margin-top: 40px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 40px; } .shared h3 { font-size: 1.4rem; margin-bottom: 10px; } .shared p { color: var(--mute); }
    .inquiry { padding-block: 24px 140px; display: grid; grid-template-columns: 1fr 1.3fr; gap: 64px; scroll-margin-top: var(--bar); }
    form { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; } .wide { grid-column: 1 / -1; }
    label { display: grid; gap: 6px; font-size: 15px; } label span { color: var(--mute); }
    input, select, textarea { font: inherit; color: var(--ink); background: transparent; border: 0; border-bottom: 1px solid var(--rule); border-radius: 0; padding: 10px 0; width: 100%; } textarea { resize: vertical; }
    select { background: var(--bg); } input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-bottom-color: transparent; }
    .trap { position: absolute; left: -9999px; width: 1px; height: 1px; } .act { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; } .status { color: var(--mute); max-width: 44ch; }
    @media (max-width: 1100px) { .offers li, .inquiry { grid-template-columns: 1fr; gap: 16px; } .inquiry { gap: 32px; } }`,
})
export class Partnership {
  protected readonly c = inject(SiteService).pick(copy);
  private readonly site = inject(SiteService);
  protected readonly state = signal<'idle' | 'sending' | 'sent' | 'off' | 'error'>('idle');

  protected async send(e: Event): Promise<void> {
    e.preventDefault();
    const f = e.target as HTMLFormElement;
    if (!f.reportValidity()) return;
    const data = Object.fromEntries(new FormData(f)) as Record<string, string>;
    if (data['website']) { this.state.set('sent'); return; } // the hidden field only a bot fills in
    if (!INQUIRY_ENDPOINT) { this.state.set('off'); return; } // never pretend to send
    this.state.set('sending');
    try {
      const r = await fetch(INQUIRY_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...data, lang: this.site.lang(), source: 'partnership' }) });
      this.state.set(r.ok ? 'sent' : 'error'); if (r.ok) f.reset();
    } catch { this.state.set('error'); }
  }
}
