import { pair } from '../core/site-service';

export const shell = pair(
  {
    nav: { home: 'Home', clinics: 'Clinics', partnership: 'Partnership', about: 'About' },
    open: 'Open Dontalist', become: 'Become a Dontalist', openHint: 'Sign in to the Dontalist Dental Practice Management System',
    settings: 'Language and appearance', language: 'Language', appearance: 'Appearance', system: 'System', light: 'Light', dark: 'Dark', menu: 'Menu', skip: 'Skip to content',
    footer: {
      tagline: 'Dentistry is your profession. Building a better practice is your next step.',
      explore: 'Explore', product: 'Dontalist Dental Practice Management System', productLine: 'The software at the centre of the ecosystem.',
      contact: 'Talk to us', contactLine: 'Co-branding, franchise and affiliate enquiries go through the form on the partnership page.',
      attributions: 'Attributions', rights: 'Dontalist. All rights reserved.',
    },
  },
  {
    nav: { home: 'Accueil', clinics: 'Cabinets', partnership: 'Partenariat', about: 'À propos' },
    open: 'Ouvrir Dontalist', become: 'Devenir Dontalist', openHint: 'Se connecter au système de gestion de cabinet dentaire Dontalist',
    settings: 'Langue et apparence', language: 'Langue', appearance: 'Apparence', system: 'Système', light: 'Clair', dark: 'Sombre', menu: 'Menu', skip: 'Aller au contenu',
    footer: {
      tagline: 'La dentisterie est votre métier. Construire un meilleur cabinet est votre prochaine étape.',
      explore: 'Explorer', product: 'Système de gestion de cabinet dentaire Dontalist', productLine: 'Le logiciel au cœur de l’écosystème.',
      contact: 'Nous parler', contactLine: 'Les demandes de co-branding, de franchise et d’affiliation passent par le formulaire de la page partenariat.',
      attributions: 'Crédits', rights: 'Dontalist. Tous droits réservés.',
    },
  },
);
