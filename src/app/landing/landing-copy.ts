import type { Lang } from '../core/i18n/i18n.service';

export type ShotId = 'today' | 'calendar' | 'patient' | 'chart' | 'billing' | 'doctor' | 'reports';

interface Copy {
  nav: { product: string; facts: string; partners: string; open: string };
  hero: { title: string; lead: string; cta: string; more: string; alt: string };
  tourTitle: string;
  tour: Record<ShotId, { tab: string; title: string; body: string; points: [string, string, string]; alt: string }>;
  facts: { title: string; body: string }[];
  closing: { title: string; body: string; cta: string };
  foot: string;
  seoTitle: string;
  seoDescription: string;
  demoNote: string;
}

export const SHOTS: readonly ShotId[] = ['today', 'calendar', 'patient', 'chart', 'billing', 'doctor', 'reports'];

export const COPY: Record<Lang, Copy> = {
  en: {
    nav: { product: 'Product', facts: 'Why Dontalist', partners: 'Partnerships', open: 'Open Dontalist' },
    hero: {
      title: 'Dental clinic software that stays out of your way.',
      lead: 'Appointments, patient files, a 3D dental chart, billing and reminders in one calm workspace. Runs in your browser, in French and English.',
      cta: 'Open Dontalist',
      more: 'See it working',
      alt: 'The Dontalist calendar with three chairs and two dentists',
    },
    tourTitle: 'Every screen below is the real application.',
    tour: {
      today: { tab: 'Today', title: 'Your day at a glance', body: 'Who is waiting, who is in the chair, who is next, and who to remind for tomorrow.', points: ['Waiting room with minutes waited', 'One-tap WhatsApp reminders', 'Patients overdue for a check-up'], alt: 'The Today dashboard' },
      calendar: { tab: 'Calendar', title: 'A calendar built for chairs', body: 'Drag a visit to move it. Clashes with a dentist, chair or patient are refused with the reason.', points: ['Chair and dentist colours', 'Drag, resize, or drag to create', 'Day, week, month and year'], alt: 'The calendar in day view' },
      patient: { tab: 'Patient file', title: 'A complete file in one place', body: 'Medical alerts, visits, acts, payments and messages, with the history kept as it happened.', points: ['Medical alert always visible', 'Activity timeline', 'Hide the pages you do not use'], alt: 'A patient file overview' },
      chart: { tab: 'Dental chart', title: 'A 3D odontogram', body: 'Record findings per tooth and surface in 3D. Routine acts never need the chart.', points: ['FDI or Universal numbering', 'Initial, current and treatment plan views', 'Export and print the chart'], alt: 'The dental chart' },
      billing: { tab: 'Billing', title: 'Invoices and payments you can trust', body: 'Offline clinic payments, numbered invoices, credit notes, and a balance that always adds up.', points: ['Cash, card, transfer and cheque', 'Invoices are never edited, only credited', 'Printable statements and receipts'], alt: 'The patient billing page' },
      doctor: { tab: 'Doctor profile', title: 'A profile for every dentist', body: 'Schedule, patients, acts and contact details for each doctor, laid out like a patient file.', points: ['Upcoming visits', 'Patients seen', 'Acts recorded from visits'], alt: 'A dentist profile' },
      reports: { tab: 'Reports', title: 'See how the clinic is doing', body: 'Revenue, collections and activity for the period you choose, exportable to CSV.', points: ['Payments by method', 'Per-dentist view', 'Voided payments excluded'], alt: 'The reports page' },
    },
    facts: [
      { title: 'Your data stays on your computer', body: 'Dontalist stores the clinic in your browser. Download a backup file regularly and keep it safe.' },
      { title: 'French and English', body: 'Switch the interface language at any time, and write messages to patients in either.' },
      { title: 'Light and dark', body: 'Made for desktop and tablet, with a light and a dark theme that stay easy to read at the chair.' },
    ],
    closing: { title: 'Open it and look around.', body: 'No account to create. Add a dentist and a chair, then book your first visit.', cta: 'Open Dontalist' },
    foot: 'Dontalist. Dental practice management.',
    seoTitle: 'Dontalist: dental clinic management software',
    seoDescription: 'Appointments, patient files, a 3D dental chart, billing and reminders for dental clinics, in French and English.',
    demoNote: 'Screens show a demo clinic with invented patients.',
  },
  fr: {
    nav: { product: 'Produit', facts: 'Pourquoi Dontalist', partners: 'Partenariats', open: 'Ouvrir Dontalist' },
    hero: {
      title: 'Le logiciel de cabinet dentaire qui ne vous ralentit pas.',
      lead: 'Rendez-vous, dossiers patients, schéma dentaire 3D, facturation et rappels dans un espace de travail clair. Fonctionne dans votre navigateur, en français et en anglais.',
      cta: 'Ouvrir Dontalist',
      more: 'Voir en action',
      alt: 'L’agenda Dontalist avec trois fauteuils et deux dentistes',
    },
    tourTitle: 'Chaque écran ci-dessous est la vraie application.',
    tour: {
      today: { tab: 'Aujourd’hui', title: 'Votre journée en un coup d’œil', body: 'Qui attend, qui est au fauteuil, qui est le prochain, et qui rappeler pour demain.', points: ['Salle d’attente avec temps d’attente', 'Rappels WhatsApp en un clic', 'Patients à revoir pour un contrôle'], alt: 'Le tableau de bord Aujourd’hui' },
      calendar: { tab: 'Agenda', title: 'Un agenda pensé pour les fauteuils', body: 'Glissez une visite pour la déplacer. Un conflit de dentiste, de fauteuil ou de patient est refusé avec la raison.', points: ['Couleurs par fauteuil et par dentiste', 'Glisser, redimensionner, créer', 'Jour, semaine, mois et année'], alt: 'L’agenda en vue jour' },
      patient: { tab: 'Dossier patient', title: 'Un dossier complet au même endroit', body: 'Alertes médicales, visites, actes, paiements et messages, avec l’historique conservé tel qu’il s’est produit.', points: ['Alerte médicale toujours visible', 'Fil d’activité', 'Masquez les pages inutiles'], alt: 'L’aperçu d’un dossier patient' },
      chart: { tab: 'Schéma dentaire', title: 'Un odontogramme 3D', body: 'Notez les constats par dent et par face en 3D. Les actes courants n’exigent jamais le schéma.', points: ['Numérotation FDI ou universelle', 'Vues initial, actuel et plan de traitement', 'Export et impression du schéma'], alt: 'Le schéma dentaire' },
      billing: { tab: 'Facturation', title: 'Des factures et paiements fiables', body: 'Paiements au cabinet, factures numérotées, avoirs, et un solde qui tombe toujours juste.', points: ['Espèces, carte, virement et chèque', 'Une facture ne se modifie pas, elle s’annule par avoir', 'Relevés et reçus imprimables'], alt: 'La page de facturation d’un patient' },
      doctor: { tab: 'Profil du docteur', title: 'Un profil pour chaque dentiste', body: 'Planning, patients, actes et coordonnées de chaque docteur, présentés comme un dossier patient.', points: ['Prochaines visites', 'Patients vus', 'Actes enregistrés depuis les visites'], alt: 'Le profil d’un dentiste' },
      reports: { tab: 'Rapports', title: 'Voyez comment va le cabinet', body: 'Chiffre d’affaires, encaissements et activité sur la période choisie, exportables en CSV.', points: ['Paiements par mode', 'Vue par dentiste', 'Paiements annulés exclus'], alt: 'La page des rapports' },
    },
    facts: [
      { title: 'Vos données restent sur votre ordinateur', body: 'Dontalist conserve le cabinet dans votre navigateur. Téléchargez régulièrement une sauvegarde et gardez-la en lieu sûr.' },
      { title: 'Français et anglais', body: 'Changez la langue de l’interface à tout moment, et rédigez les messages aux patients dans l’une ou l’autre.' },
      { title: 'Clair et sombre', body: 'Conçu pour ordinateur et tablette, avec un thème clair et un thème sombre lisibles au fauteuil.' },
    ],
    closing: { title: 'Ouvrez-le et explorez.', body: 'Aucun compte à créer. Ajoutez un dentiste et un fauteuil, puis planifiez votre première visite.', cta: 'Ouvrir Dontalist' },
    foot: 'Dontalist. Gestion de cabinet dentaire.',
    seoTitle: 'Dontalist : logiciel de gestion de cabinet dentaire',
    seoDescription: 'Rendez-vous, dossiers patients, schéma dentaire 3D, facturation et rappels pour cabinets dentaires, en français et en anglais.',
    demoNote: 'Les écrans montrent un cabinet de démonstration avec des patients fictifs.',
  },
};
