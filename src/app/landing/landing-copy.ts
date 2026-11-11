import type { Lang } from '../core/i18n/i18n.service';

export type ShotId = 'today' | 'calendar' | 'patient' | 'chart' | 'billing' | 'doctor' | 'reports';
/** The five moments of a clinic day, each shown with a real screen. A genuine sequence, so they are numbered. */
export const STEPS = ['book', 'welcome', 'care', 'bill', 'review'] as const;
export type StepId = (typeof STEPS)[number];
export const STEP_SHOT: Record<StepId, ShotId> = { book: 'calendar', welcome: 'today', care: 'chart', bill: 'billing', review: 'reports' };
export const SHOTS: readonly ShotId[] = ['today', 'calendar', 'patient', 'chart', 'billing', 'doctor', 'reports'];

interface Step { tab: string; title: string; body: string; points: [string, string, string]; alt: string }
interface Band { title: string; body: string; points: string[]; alt: string }
interface Copy {
  nav: { day: string; modules: string; data: string; faq: string; partners: string; open: string };
  hero: { title: string; lead: string; cta: string; more: string; alt: string; proof: string[] };
  day: { title: string; lead: string; steps: Record<StepId, Step> };
  file: Band;
  team: Band;
  modules: { title: string; lead: string; groups: { name: string; items: { name: string; body: string }[] }[] };
  data: { title: string; lead: string; items: { title: string; body: string }[] };
  start: { title: string; steps: { title: string; body: string }[]; note: string };
  faq: { title: string; items: { q: string; a: string }[] };
  partners: { title: string; body: string; cta: string };
  closing: { title: string; body: string; cta: string };
  foot: string;
  seoTitle: string;
  seoDescription: string;
  demoNote: string;
}

export const COPY: Record<Lang, Copy> = {
  en: {
    nav: { day: 'A clinic day', modules: 'Modules', data: 'Your data', faq: 'Questions', partners: 'Partnerships', open: 'Open Dontalist' },
    hero: {
      title: 'Dental clinic software that stays out of your way.',
      lead: 'Appointments, patient files, a 3D dental chart, billing and reminders in one calm workspace. Runs in your browser, in French and English, and keeps working without internet.',
      cta: 'Open Dontalist',
      more: 'See a clinic day',
      alt: 'The Dontalist calendar with three chairs and two dentists',
      proof: ['3D dental chart', 'Works offline', 'French and English', 'No account to create'],
    },
    day: {
      title: 'One clinic day, start to finish.',
      lead: 'Every screen below is the real application, with a demo clinic and invented patients.',
      steps: {
        book: { tab: 'Book', title: 'A calendar built for chairs', body: 'Drag a visit to move it. Clashes with a dentist, chair or patient are refused with the reason.', points: ['Chair and dentist colours', 'Drag, resize, or drag to create', 'Day, week, month and year'], alt: 'The calendar in day view' },
        welcome: { tab: 'Welcome', title: 'Your day at a glance', body: 'Who is waiting, who is in the chair, who is next, and who to remind for tomorrow.', points: ['Waiting room with minutes waited', 'One-tap WhatsApp reminders', 'Patients overdue for a check-up'], alt: 'The Today dashboard' },
        care: { tab: 'Care', title: 'A 3D dental chart', body: 'Record findings per tooth and surface in 3D. Routine acts never need the chart.', points: ['FDI or Universal numbering', 'Initial, current and treatment plan views', 'Export and print the chart'], alt: 'The dental chart' },
        bill: { tab: 'Bill', title: 'Invoices and payments you can trust', body: 'Offline clinic payments, numbered invoices, credit notes, and a balance that always adds up.', points: ['Cash, card, transfer and cheque', 'Invoices are never edited, only credited', 'Printable statements and receipts'], alt: 'The patient billing page' },
        review: { tab: 'Review', title: 'See how the clinic is doing', body: 'Revenue, collections and activity for the period you choose, exportable to CSV.', points: ['Payments by method', 'Per-dentist view', 'Voided payments excluded'], alt: 'The reports page' },
      },
    },
    file: { title: 'A complete file in one place', body: 'Medical alerts, visits, acts, payments and messages, with the history kept as it happened. Allergies and medications are records from your own library, so an alert is never a guess.', points: ['Medical alert always visible', 'Activity timeline', 'Prescriptions that cannot be silently changed', 'Hide the pages you do not use'], alt: 'A patient file overview' },
    team: { title: 'A profile for every dentist, the right screens for every role', body: 'Schedule, patients, acts and contact details for each doctor, laid out like a patient file. Give each person a role and a PIN, so reception sees billing and dentists see clinical records.', points: ['Dentist, assistant and reception roles', 'PIN lock on the device', 'Per-clinic page toggles'], alt: 'A dentist profile' },
    modules: {
      title: 'Everything the clinic runs on',
      lead: 'One system instead of a calendar, a spreadsheet, a stock book and a folder of PDFs.',
      groups: [
        { name: 'Schedule and flow', items: [
          { name: 'Calendar', body: 'Chairs, dentists, opening hours and a slot finder.' },
          { name: 'Waiting room', body: 'Who is here, since when, and who is next.' },
          { name: 'Reminders', body: 'WhatsApp click-to-chat messages in French or English.' },
        ] },
        { name: 'Clinical', items: [
          { name: '3D dental chart', body: 'Findings and plan per tooth and surface, with periodontal charting.' },
          { name: 'Treatment plans and quotes', body: 'Versioned quotes linked to acts and payment.' },
          { name: 'Prescriptions', body: 'Your own medication and allergy libraries, templates and printable A4.' },
          { name: 'Visit notes and imaging', body: 'Notes with revisions, and files attached per patient and tooth.' },
        ] },
        { name: 'Money', items: [
          { name: 'Invoices and payments', body: 'Numbered invoices, credit notes, cash, card, transfer and cheque.' },
          { name: 'Expenses', body: 'Record the clinic’s charges next to its income.' },
          { name: 'Reports', body: 'Revenue, collections and activity, exportable to CSV.' },
        ] },
        { name: 'Practice', items: [
          { name: 'Stock', body: 'Products in and out, with low-stock warnings.' },
          { name: 'Lab work', body: 'Track prosthesis cases sent to the laboratory.' },
          { name: 'Tasks', body: 'A shared to-do list for the team.' },
          { name: 'Documents and letters', body: 'A document designer and upload-and-fill PDF forms.' },
          { name: 'Public clinic page', body: 'A page for your clinic that you control.' },
        ] },
      ],
    },
    data: {
      title: 'Your clinic, on your device',
      lead: 'Dontalist stores the clinic in your browser, so there is nothing to host and nothing leaves your computer in this version.',
      items: [
        { title: 'Works without internet', body: 'Install it like an app and keep working when the connection drops.' },
        { title: 'Backups you control', body: 'Download the whole clinic as one file, and restore it on any computer.' },
        { title: 'Roles and PIN', body: 'Staff see only the screens their role allows. This protects a shared computer; it is not a replacement for server accounts.' },
        { title: 'French and English', body: 'Switch the interface at any time, and write patient messages in either.' },
        { title: 'Light and dark', body: 'Made for desktop and tablet, readable at the chair in either theme.' },
      ],
    },
    start: {
      title: 'Start in an afternoon',
      steps: [
        { title: 'Open it', body: 'No account, no installation, no card. It opens in your browser.' },
        { title: 'Set up the clinic', body: 'Add your dentists, chairs and opening hours, and your list of acts.' },
        { title: 'Book the first visit', body: 'Add a patient and put them in the calendar. The rest follows.' },
      ],
      note: 'Keep a backup file: because your data lives on your device, the backup is your safety net.',
    },
    faq: {
      title: 'Questions',
      items: [
        { q: 'Does it need an internet connection?', a: 'It opens in your browser and, once installed, keeps working offline. Everything you enter is saved on your device.' },
        { q: 'Where is my data stored, and is it safe?', a: 'In your browser on your own computer. Nothing is sent to a server in this version. Download a backup file regularly and keep it safe.' },
        { q: 'Can several people use it at the same time?', a: 'Not yet. Data lives on one device, so it suits one workstation at the front desk or in the surgery. Shared access needs a server, which is planned but not built.' },
        { q: 'Does it do online booking, SMS or insurance claims?', a: 'Not yet. Reminders are WhatsApp click-to-chat messages. Online booking and SMS need a server, and insurance forms are not built.' },
        { q: 'Can I move my data to another computer?', a: 'Yes. Download the clinic backup file and restore it on the other computer.' },
        { q: 'Which languages does it speak?', a: 'French and English, everywhere, including printed documents.' },
        { q: 'What does it cost?', a: 'There is no account or payment step in this version. Pricing will be published before any paid plan exists.' },
        { q: 'Does the dental chart replace my clinical judgement?', a: 'No. The chart records what you decide. Diagnoses are never confirmed automatically, and warnings come only from records and alerts you set.' },
      ],
    },
    partners: { title: 'Dontalist is also a professional community.', body: 'Dentists, clinics and partners can join the Dontalist movement. It is separate from the software, and you do not need one to have the other.', cta: 'Explore partnerships' },
    closing: { title: 'Open it and look around.', body: 'No account to create. Add a dentist and a chair, then book your first visit.', cta: 'Open Dontalist' },
    foot: 'Dontalist. Dental practice management.',
    seoTitle: 'Dontalist: dental clinic management software',
    seoDescription: 'Appointments, patient files, a 3D dental chart, billing and reminders for dental clinics. Works offline, in French and English.',
    demoNote: 'Screens show a demo clinic with invented patients.',
  },
  fr: {
    nav: { day: 'Une journée', modules: 'Modules', data: 'Vos données', faq: 'Questions', partners: 'Partenariats', open: 'Ouvrir Dontalist' },
    hero: {
      title: 'Le logiciel de cabinet dentaire qui ne vous ralentit pas.',
      lead: 'Rendez-vous, dossiers patients, schéma dentaire 3D, facturation et rappels dans un espace de travail clair. Fonctionne dans votre navigateur, en français et en anglais, et continue sans internet.',
      cta: 'Ouvrir Dontalist',
      more: 'Voir une journée',
      alt: 'L’agenda Dontalist avec trois fauteuils et deux dentistes',
      proof: ['Schéma dentaire 3D', 'Fonctionne hors ligne', 'Français et anglais', 'Aucun compte à créer'],
    },
    day: {
      title: 'Une journée de cabinet, du début à la fin.',
      lead: 'Chaque écran ci-dessous est la vraie application, avec un cabinet de démonstration et des patients fictifs.',
      steps: {
        book: { tab: 'Planifier', title: 'Un agenda pensé pour les fauteuils', body: 'Glissez une visite pour la déplacer. Un conflit de dentiste, de fauteuil ou de patient est refusé avec la raison.', points: ['Couleurs par fauteuil et dentiste', 'Glisser, redimensionner, ou glisser pour créer', 'Jour, semaine, mois et année'], alt: 'L’agenda en vue jour' },
        welcome: { tab: 'Accueillir', title: 'Votre journée en un coup d’œil', body: 'Qui attend, qui est au fauteuil, qui est le prochain, et qui rappeler pour demain.', points: ['Salle d’attente avec minutes d’attente', 'Rappels WhatsApp en un geste', 'Patients à relancer pour un contrôle'], alt: 'Le tableau de bord du jour' },
        care: { tab: 'Soigner', title: 'Un schéma dentaire 3D', body: 'Notez les constats par dent et par face en 3D. Les actes courants n’exigent jamais le schéma.', points: ['Numérotation FDI ou universelle', 'Vues initiale, actuelle et plan de traitement', 'Export et impression du schéma'], alt: 'Le schéma dentaire' },
        bill: { tab: 'Facturer', title: 'Des factures et paiements fiables', body: 'Paiements au cabinet, factures numérotées, avoirs, et un solde qui tombe toujours juste.', points: ['Espèces, carte, virement et chèque', 'Une facture ne se modifie pas, elle se corrige par un avoir', 'Relevés et reçus imprimables'], alt: 'La page de facturation du patient' },
        review: { tab: 'Analyser', title: 'Voyez comment va le cabinet', body: 'Chiffre d’affaires, encaissements et activité sur la période choisie, exportables en CSV.', points: ['Paiements par mode', 'Vue par dentiste', 'Paiements annulés exclus'], alt: 'La page des rapports' },
      },
    },
    file: { title: 'Un dossier complet au même endroit', body: 'Alertes médicales, visites, actes, paiements et messages, avec l’historique conservé tel qu’il s’est produit. Allergies et médicaments sont des fiches de votre propre bibliothèque : une alerte n’est jamais une devinette.', points: ['Alerte médicale toujours visible', 'Fil d’activité', 'Des ordonnances qu’on ne peut pas modifier en silence', 'Masquez les pages que vous n’utilisez pas'], alt: 'Le dossier d’un patient' },
    team: { title: 'Un profil par dentiste, les bons écrans pour chaque rôle', body: 'Planning, patients, actes et coordonnées de chaque docteur, présentés comme un dossier patient. Donnez à chacun un rôle et un code PIN : l’accueil voit la facturation, les dentistes voient les dossiers cliniques.', points: ['Rôles dentiste, assistant et accueil', 'Verrouillage par code PIN sur l’appareil', 'Pages activables par cabinet'], alt: 'Le profil d’un dentiste' },
    modules: {
      title: 'Tout ce qui fait tourner le cabinet',
      lead: 'Un seul système à la place d’un agenda, d’un tableur, d’un cahier de stock et d’un dossier de PDF.',
      groups: [
        { name: 'Planning et flux', items: [
          { name: 'Agenda', body: 'Fauteuils, dentistes, horaires d’ouverture et recherche de créneau.' },
          { name: 'Salle d’attente', body: 'Qui est là, depuis quand, et qui est le prochain.' },
          { name: 'Rappels', body: 'Messages WhatsApp en un clic, en français ou en anglais.' },
        ] },
        { name: 'Clinique', items: [
          { name: 'Schéma dentaire 3D', body: 'Constats et plan par dent et par face, avec sondage parodontal.' },
          { name: 'Plans de traitement et devis', body: 'Devis versionnés liés aux actes et au paiement.' },
          { name: 'Ordonnances', body: 'Vos propres bibliothèques de médicaments et d’allergies, modèles et A4 imprimable.' },
          { name: 'Notes de visite et imagerie', body: 'Notes avec révisions, et fichiers rattachés par patient et par dent.' },
        ] },
        { name: 'Argent', items: [
          { name: 'Factures et paiements', body: 'Factures numérotées, avoirs, espèces, carte, virement et chèque.' },
          { name: 'Charges', body: 'Enregistrez les charges du cabinet à côté de ses recettes.' },
          { name: 'Rapports', body: 'Chiffre d’affaires, encaissements et activité, exportables en CSV.' },
        ] },
        { name: 'Cabinet', items: [
          { name: 'Stock', body: 'Entrées et sorties de produits, avec alertes de stock bas.' },
          { name: 'Travaux de laboratoire', body: 'Suivez les prothèses envoyées au laboratoire.' },
          { name: 'Tâches', body: 'Une liste de tâches partagée pour l’équipe.' },
          { name: 'Documents et courriers', body: 'Un concepteur de documents et des formulaires PDF à remplir.' },
          { name: 'Page publique du cabinet', body: 'Une page de votre cabinet, que vous contrôlez.' },
        ] },
      ],
    },
    data: {
      title: 'Votre cabinet, sur votre appareil',
      lead: 'Dontalist conserve le cabinet dans votre navigateur : rien à héberger, et dans cette version rien ne quitte votre ordinateur.',
      items: [
        { title: 'Fonctionne sans internet', body: 'Installez-le comme une application et continuez quand la connexion tombe.' },
        { title: 'Des sauvegardes que vous maîtrisez', body: 'Téléchargez tout le cabinet dans un seul fichier, et restaurez-le sur n’importe quel ordinateur.' },
        { title: 'Rôles et code PIN', body: 'Chacun ne voit que les écrans de son rôle. Cela protège un poste partagé ; ce n’est pas un remplacement de comptes serveur.' },
        { title: 'Français et anglais', body: 'Changez la langue à tout moment, et rédigez les messages aux patients dans l’une ou l’autre.' },
        { title: 'Clair et sombre', body: 'Conçu pour ordinateur et tablette, lisible au fauteuil dans les deux thèmes.' },
      ],
    },
    start: {
      title: 'Démarrez en un après-midi',
      steps: [
        { title: 'Ouvrez-le', body: 'Pas de compte, pas d’installation, pas de carte. Il s’ouvre dans votre navigateur.' },
        { title: 'Configurez le cabinet', body: 'Ajoutez vos dentistes, vos fauteuils, vos horaires et votre liste d’actes.' },
        { title: 'Planifiez la première visite', body: 'Ajoutez un patient et placez-le dans l’agenda. Le reste suit.' },
      ],
      note: 'Gardez un fichier de sauvegarde : vos données vivent sur votre appareil, la sauvegarde est votre filet de sécurité.',
    },
    faq: {
      title: 'Questions',
      items: [
        { q: 'Faut-il une connexion internet ?', a: 'Il s’ouvre dans votre navigateur et, une fois installé, continue hors ligne. Tout ce que vous saisissez est enregistré sur votre appareil.' },
        { q: 'Où sont mes données, et sont-elles en sécurité ?', a: 'Dans votre navigateur, sur votre propre ordinateur. Rien n’est envoyé à un serveur dans cette version. Téléchargez régulièrement une sauvegarde et gardez-la en lieu sûr.' },
        { q: 'Plusieurs personnes peuvent-elles l’utiliser en même temps ?', a: 'Pas encore. Les données vivent sur un appareil : il convient à un poste, à l’accueil ou au fauteuil. L’accès partagé demande un serveur, prévu mais pas encore construit.' },
        { q: 'Propose-t-il la prise de rendez-vous en ligne, les SMS ou les feuilles de soins ?', a: 'Pas encore. Les rappels passent par WhatsApp en un clic. La prise de rendez-vous en ligne et les SMS demandent un serveur, et les feuilles de soins ne sont pas construites.' },
        { q: 'Puis-je déplacer mes données sur un autre ordinateur ?', a: 'Oui. Téléchargez le fichier de sauvegarde du cabinet et restaurez-le sur l’autre ordinateur.' },
        { q: 'Dans quelles langues fonctionne-t-il ?', a: 'Français et anglais partout, y compris les documents imprimés.' },
        { q: 'Combien ça coûte ?', a: 'Il n’y a ni compte ni paiement dans cette version. Les tarifs seront publiés avant l’existence de toute offre payante.' },
        { q: 'Le schéma dentaire remplace-t-il mon jugement clinique ?', a: 'Non. Le schéma enregistre ce que vous décidez. Un diagnostic n’est jamais confirmé automatiquement, et les alertes viennent uniquement des fiches et des règles que vous définissez.' },
      ],
    },
    partners: { title: 'Dontalist, c’est aussi une communauté professionnelle.', body: 'Dentistes, cabinets et partenaires peuvent rejoindre le mouvement Dontalist. C’est distinct du logiciel : vous n’avez pas besoin de l’un pour avoir l’autre.', cta: 'Découvrir les partenariats' },
    closing: { title: 'Ouvrez-le et explorez.', body: 'Aucun compte à créer. Ajoutez un dentiste et un fauteuil, puis planifiez votre première visite.', cta: 'Ouvrir Dontalist' },
    foot: 'Dontalist. Gestion de cabinet dentaire.',
    seoTitle: 'Dontalist : logiciel de gestion de cabinet dentaire',
    seoDescription: 'Rendez-vous, dossiers patients, schéma dentaire 3D, facturation et rappels pour cabinets dentaires. Fonctionne hors ligne, en français et en anglais.',
    demoNote: 'Les écrans montrent un cabinet de démonstration avec des patients fictifs.',
  },
};
