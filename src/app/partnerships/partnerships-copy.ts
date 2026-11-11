import type { Lang } from '../core/i18n/i18n.service';
import type { Applicant, Pathway } from './partnership-rules';

interface Offer { n: string; name: string; kind: string; forWho: string; commitment: string; brand: string; includes: string[]; carries: string; cta: string }

interface Copy {
  nav: { crm: string; apply: string };
  hero: { title: string; lead: string; cta: string; more: string };
  identity: { title: string; body: string[] };
  why: { title: string; items: { title: string; body: string }[] };
  offers: { title: string; intro: string; rows: Record<Pathway, Offer>; labels: { forWho: string; commitment: string; brand: string; includes: string } };
  pillars: { title: string; items: { title: string; body: string }[] };
  process: { title: string; steps: { title: string; body: string }[]; note: string };
  founding: { title: string; body: string; note: string };
  faq: { title: string; items: { q: string; a: string }[] };
  closing: { title: string; body: string };
  legal: string;
  foot: string;
  seoTitle: string;
  seoDescription: string;
  form: {
    title: string; lead: string; pathway: string; applicant: string; applicants: Record<Applicant, string>;
    f: Record<'name' | 'email' | 'phone' | 'country' | 'city' | 'licence' | 'clinic' | 'chairs' | 'project' | 'timeline' | 'message', string>;
    optional: string; projects: { new: string; convert: string }; interests: string; interestOptions: Record<Pathway, string[]>;
    consent: string; submit: string; missing: string; invalid: string; reviewTitle: string; reviewBody: string; download: string; edit: string; newOne: string; fileName: string;
  };
}

export const COPY: Record<Lang, Copy> = {
  en: {
    nav: { crm: 'Dontalist CRM', apply: 'Apply' },
    hero: {
      title: 'Become a Dontalist.',
      lead: 'Dontalist is a shared professional identity for dentists and the people who work with them: a community, a way of working and a set of partnerships you can grow into at your own pace.',
      cta: 'Start an application',
      more: 'See the three ways in',
    },
    identity: {
      title: 'A name you share, a practice that stays yours.',
      body: [
        'To be a Dontalist is to belong to a professional movement: dentists, clinics and partners who choose to build better practice together, while each remains responsible for their own patients and their own clinical decisions.',
        'It is not a software subscription and it is not an employer. Dontalist does not replace your professional licence, your clinical judgement or your legal responsibilities. Dontalist CRM is one optional technology offering in the wider ecosystem. You do not need it to become a Dontalist, and becoming a Dontalist does not oblige you to buy it.',
      ],
    },
    why: {
      title: 'Why become a Dontalist',
      items: [
        { title: 'Belong to a profession, not a vendor', body: 'Meet colleagues who share how you want to practise, and take part in a community built by dentists.' },
        { title: 'Do not run the business side alone', body: 'Practice development, procurement and operations are easier when they are shared and organised.' },
        { title: 'Keep what is yours', body: 'Depending on the pathway, you keep your clinic identity, your ownership and your clinical independence.' },
        { title: 'Choose your depth', body: 'Start with membership. Go further only if and when it makes sense for you.' },
      ],
    },
    offers: {
      title: 'Three ways in, with different commitments.',
      intro: 'Each pathway builds on the one before it. They differ in commitment, brand use, services and commercial terms. Terms are set in a tailored proposal after review; none are published here.',
      labels: { forWho: 'For', commitment: 'Commitment', brand: 'Dontalist brand', includes: 'What it includes' },
      rows: {
        become: {
          n: '01', name: 'Become a Dontalist', kind: 'Professional membership',
          forWho: 'Dentists who want to adopt the shared identity and take part in the professional community.',
          commitment: 'Lightest. No change to your clinic.', brand: 'Use of the Dontalist membership identity, as defined in your proposal.',
          includes: ['Professional networking', 'Educational opportunities', 'Member resources', 'Partner and supplier opportunities', 'Collective purchasing opportunities', 'Optional access to Dontalist products and services'],
          carries: '', cta: 'Become a Dontalist',
        },
        grow: {
          n: '02', name: 'Grow as a Dontalist', kind: 'Practice growth partnership',
          forWho: 'Existing independent clinics that want a deeper relationship while keeping their own identity and ownership.',
          commitment: 'A working relationship with your clinic.', brand: 'Optional co-branding and Dontalist endorsement, alongside your own clinic name.',
          includes: ['Practice development', 'Digital presence and compliant communications support', 'Supplier and procurement coordination', 'Technology and operational infrastructure', 'Staff development and business guidance'],
          carries: 'Everything in membership, plus:', cta: 'Grow as a Dontalist',
        },
        build: {
          n: '03', name: 'Build as a Dontalist', kind: 'Full franchise partnership',
          forWho: 'Qualified dentists and legally eligible investors who want to establish a new clinic, or convert an existing one.',
          commitment: 'The deepest: a licensed clinic under the Dontalist brand.', brand: 'Full Dontalist brand licensing.',
          includes: ['Clinic establishment and conversion assistance', 'Design and equipment guidance', 'A non-clinical operating framework', 'Recruitment and training support', 'Launch assistance', 'Ongoing franchise support'],
          carries: 'Everything in the first two pathways, plus:', cta: 'Build as a Dontalist',
        },
      },
    },
    pillars: {
      title: 'Five pillars behind the name',
      items: [
        { title: 'Professional identity and community', body: 'A shared name and a place to meet, exchange and be recognised as part of something larger than one practice.' },
        { title: 'Practice development', body: 'Guidance on organising, communicating and growing a clinic, within professional rules.' },
        { title: 'Knowledge and education', body: 'Learning opportunities and member resources for dentists and their teams.' },
        { title: 'Procurement and commercial partnerships', body: 'Supplier relationships and collective purchasing opportunities, with terms set by each partner.' },
        { title: 'Technology and infrastructure', body: 'Tools and operating infrastructure, including Dontalist CRM as an optional offering.' },
      ],
    },
    process: {
      title: 'How an application works',
      steps: [
        { title: 'Choose a pathway', body: 'Pick the one closest to where you are. You can change your mind later.' },
        { title: 'Tell us about you', body: 'Answer only the questions that apply to your pathway.' },
        { title: 'We review it', body: 'Every application is reviewed by the Dontalist team. Applying does not mean you are accepted.' },
        { title: 'A tailored proposal', body: 'If there is a fit, you receive a proposal for your situation, with its terms, to consider without obligation.' },
      ],
      note: 'In this version the form prepares your application as a file on your device. Online sending is not connected yet.',
    },
    founding: {
      title: 'Founding Dontalists',
      body: 'The first people to join help decide what the community becomes. Early applications are read with particular attention, and founding members are invited to shape how resources, events and partnerships are organised.',
      note: 'Any founding terms are set out individually in your proposal. Nothing is promised in advance.',
    },
    faq: {
      title: 'Questions',
      items: [
        { q: 'Do I need Dontalist CRM to become a Dontalist?', a: 'No. Dontalist CRM is a separate, optional product. Membership does not require it, and buying it does not make you a Dontalist.' },
        { q: 'Do I give up my clinic’s name or ownership?', a: 'Not in membership or Grow: you keep your clinic identity and ownership. The Build pathway licenses the Dontalist brand and is described in its own proposal.' },
        { q: 'Does Dontalist bring me patients or guarantee revenue?', a: 'No. Dontalist makes no promise of patient numbers, revenue or discounts.' },
        { q: 'Who is responsible for clinical care?', a: 'You are. Dontalist does not replace your licence or your clinical responsibility, and does not interfere with clinical decisions.' },
        { q: 'Can an investor who is not a dentist take part?', a: 'Possibly, in the Build pathway, where the law of the country allows it. Eligibility is checked case by case and is subject to legal review.' },
        { q: 'What does it cost?', a: 'Terms depend on the pathway and your situation, and are given in a tailored proposal after your application is reviewed. No prices are published on this page.' },
        { q: 'Is my application accepted automatically?', a: 'No. Applications are reviewed and may or may not lead to a proposal.' },
      ],
    },
    closing: { title: 'Ready to become a Dontalist?', body: 'Choose the pathway that fits and tell us about your practice.' },
    legal: 'Franchise, ownership, investor participation, advertising and professional-independence arrangements are subject to legal review and to the rules of each country and profession. Nothing on this page is an offer.',
    foot: 'Dontalist Partnerships.',
    seoTitle: 'Become a Dontalist: partnerships for dentists and clinics',
    seoDescription: 'Join the Dontalist professional community, grow your clinic with a partnership, or build a Dontalist clinic. Three pathways, reviewed individually.',
    form: {
      title: 'Apply', lead: 'Answer what applies to you. Applications are reviewed and may lead to a tailored proposal. They are never accepted automatically.',
      pathway: 'Pathway', applicant: 'You are',
      applicants: { dentist: 'An independent dentist', clinicOwner: 'A clinic owner or representative', founder: 'A prospective clinic founder', investor: 'A potentially eligible investor', industry: 'Another industry partner' },
      f: { name: 'Full name', email: 'Email', phone: 'Phone', country: 'Country', city: 'City', licence: 'Professional licence or registration number', clinic: 'Clinic name', chairs: 'Number of chairs', project: 'Your project', timeline: 'When would you like to start?', message: 'Anything else you want us to know' },
      optional: 'optional', projects: { new: 'Establish a new clinic', convert: 'Convert an existing clinic' },
      interests: 'What interests you',
      interestOptions: {
        become: ['Professional networking', 'Education', 'Member resources', 'Suppliers and partners', 'Collective purchasing'],
        grow: ['Practice development', 'Digital presence', 'Procurement', 'Technology', 'Staff development'],
        build: ['Establishing a clinic', 'Converting a clinic', 'Design and equipment', 'Recruitment and training', 'Launch support'],
      },
      consent: 'I agree to be contacted about this application. I understand that it does not guarantee acceptance, and that any proposal is subject to legal review.',
      submit: 'Prepare my application', missing: 'Please complete the highlighted fields.', invalid: 'Check the highlighted fields.',
      reviewTitle: 'Your application is ready', reviewBody: 'Nothing has been sent: online sending is not connected in this version. Download your application and send it to the Dontalist team.',
      download: 'Download application', edit: 'Edit', newOne: 'Start another', fileName: 'dontalist-application',
    },
  },
  fr: {
    nav: { crm: 'Dontalist CRM', apply: 'Candidater' },
    hero: {
      title: 'Devenez Dontalist.',
      lead: 'Dontalist est une identité professionnelle partagée pour les dentistes et ceux qui travaillent avec eux : une communauté, une façon de travailler et des partenariats dans lesquels vous avancez à votre rythme.',
      cta: 'Commencer une candidature',
      more: 'Voir les trois façons d’entrer',
    },
    identity: {
      title: 'Un nom partagé, un cabinet qui reste le vôtre.',
      body: [
        'Être Dontalist, c’est appartenir à un mouvement professionnel : des dentistes, des cabinets et des partenaires qui choisissent de construire ensemble une meilleure pratique, chacun restant responsable de ses patients et de ses décisions cliniques.',
        'Ce n’est ni un abonnement logiciel ni un employeur. Dontalist ne remplace ni votre autorisation d’exercer, ni votre jugement clinique, ni vos responsabilités légales. Dontalist CRM est une offre technologique facultative de l’écosystème. Vous n’en avez pas besoin pour devenir Dontalist, et devenir Dontalist ne vous oblige pas à l’acheter.',
      ],
    },
    why: {
      title: 'Pourquoi devenir Dontalist',
      items: [
        { title: 'Appartenir à une profession, pas à un fournisseur', body: 'Rencontrez des confrères qui partagent votre façon d’exercer et participez à une communauté construite par des dentistes.' },
        { title: 'Ne pas gérer seul le côté entreprise', body: 'Le développement du cabinet, les achats et l’organisation sont plus simples quand ils sont partagés.' },
        { title: 'Garder ce qui est à vous', body: 'Selon la formule, vous gardez l’identité de votre cabinet, sa propriété et votre indépendance clinique.' },
        { title: 'Choisir votre niveau', body: 'Commencez par l’adhésion. N’allez plus loin que si, et quand, cela a du sens pour vous.' },
      ],
    },
    offers: {
      title: 'Trois façons d’entrer, avec des engagements différents.',
      intro: 'Chaque formule prolonge la précédente. Elles diffèrent par l’engagement, l’usage de la marque, les services et les conditions commerciales. Les conditions sont fixées dans une proposition sur mesure après examen ; aucune n’est publiée ici.',
      labels: { forWho: 'Pour', commitment: 'Engagement', brand: 'Marque Dontalist', includes: 'Ce que cela comprend' },
      rows: {
        become: {
          n: '01', name: 'Devenir Dontalist', kind: 'Adhésion professionnelle',
          forWho: 'Les dentistes qui veulent adopter l’identité commune et participer à la communauté professionnelle.',
          commitment: 'Le plus léger. Aucun changement pour votre cabinet.', brand: 'Usage de l’identité de membre Dontalist, tel que défini dans votre proposition.',
          includes: ['Réseau professionnel', 'Opportunités de formation', 'Ressources pour les membres', 'Opportunités avec partenaires et fournisseurs', 'Opportunités d’achats groupés', 'Accès facultatif aux produits et services Dontalist'],
          carries: '', cta: 'Devenir Dontalist',
        },
        grow: {
          n: '02', name: 'Grandir en Dontalist', kind: 'Partenariat de développement du cabinet',
          forWho: 'Les cabinets indépendants existants qui veulent une relation plus approfondie en gardant leur identité et leur propriété.',
          commitment: 'Une relation de travail avec votre cabinet.', brand: 'Co-branding facultatif et recommandation Dontalist, à côté du nom de votre cabinet.',
          includes: ['Développement du cabinet', 'Présence numérique et aide à une communication conforme', 'Coordination des fournisseurs et des achats', 'Infrastructure technologique et opérationnelle', 'Formation du personnel et conseil de gestion'],
          carries: 'Tout ce que comprend l’adhésion, et en plus :', cta: 'Grandir en Dontalist',
        },
        build: {
          n: '03', name: 'Construire en Dontalist', kind: 'Partenariat de franchise complète',
          forWho: 'Les dentistes qualifiés et les investisseurs légalement éligibles qui veulent créer un nouveau cabinet ou en convertir un existant.',
          commitment: 'Le plus profond : un cabinet sous licence de marque Dontalist.', brand: 'Licence complète de la marque Dontalist.',
          includes: ['Aide à la création et à la conversion', 'Conseil en aménagement et équipement', 'Un cadre d’exploitation non clinique', 'Aide au recrutement et à la formation', 'Accompagnement du lancement', 'Soutien continu de franchise'],
          carries: 'Tout ce que comprennent les deux premières formules, et en plus :', cta: 'Construire en Dontalist',
        },
      },
    },
    pillars: {
      title: 'Cinq piliers derrière le nom',
      items: [
        { title: 'Identité professionnelle et communauté', body: 'Un nom partagé et un lieu pour se rencontrer, échanger et être reconnu comme faisant partie de quelque chose de plus grand qu’un cabinet.' },
        { title: 'Développement du cabinet', body: 'Des conseils pour organiser, communiquer et développer un cabinet, dans le respect des règles professionnelles.' },
        { title: 'Savoir et formation', body: 'Des occasions d’apprendre et des ressources pour les dentistes et leurs équipes.' },
        { title: 'Achats et partenariats commerciaux', body: 'Des relations avec des fournisseurs et des achats groupés, aux conditions fixées par chaque partenaire.' },
        { title: 'Technologie et infrastructure', body: 'Des outils et une infrastructure d’exploitation, dont Dontalist CRM comme offre facultative.' },
      ],
    },
    process: {
      title: 'Comment fonctionne une candidature',
      steps: [
        { title: 'Choisissez une formule', body: 'Prenez celle qui correspond le mieux à votre situation. Vous pourrez changer d’avis.' },
        { title: 'Parlez-nous de vous', body: 'Répondez uniquement aux questions qui concernent votre formule.' },
        { title: 'Nous l’examinons', body: 'Chaque candidature est examinée par l’équipe Dontalist. Candidater ne signifie pas être accepté.' },
        { title: 'Une proposition sur mesure', body: 'S’il y a adéquation, vous recevez une proposition adaptée à votre situation, avec ses conditions, à étudier sans engagement.' },
      ],
      note: 'Dans cette version, le formulaire prépare votre candidature sous forme de fichier sur votre appareil. L’envoi en ligne n’est pas encore connecté.',
    },
    founding: {
      title: 'Les Dontalists fondateurs',
      body: 'Les premiers à nous rejoindre aident à décider de ce que deviendra la communauté. Les premières candidatures sont lues avec une attention particulière, et les membres fondateurs sont invités à façonner l’organisation des ressources, des événements et des partenariats.',
      note: 'Les éventuelles conditions de fondateur sont fixées individuellement dans votre proposition. Rien n’est promis à l’avance.',
    },
    faq: {
      title: 'Questions',
      items: [
        { q: 'Faut-il Dontalist CRM pour devenir Dontalist ?', a: 'Non. Dontalist CRM est un produit distinct et facultatif. L’adhésion ne l’exige pas, et l’acheter ne fait pas de vous un Dontalist.' },
        { q: 'Dois-je abandonner le nom ou la propriété de mon cabinet ?', a: 'Pas en adhésion ni en Grandir : vous gardez l’identité et la propriété de votre cabinet. La formule Construire accorde une licence de la marque Dontalist et est décrite dans sa propre proposition.' },
        { q: 'Dontalist m’apporte-t-il des patients ou garantit-il un chiffre d’affaires ?', a: 'Non. Dontalist ne promet ni nombre de patients, ni chiffre d’affaires, ni remises.' },
        { q: 'Qui est responsable des soins ?', a: 'Vous. Dontalist ne remplace pas votre autorisation d’exercer ni votre responsabilité clinique, et n’intervient pas dans les décisions cliniques.' },
        { q: 'Un investisseur qui n’est pas dentiste peut-il participer ?', a: 'Peut-être, dans la formule Construire, lorsque la loi du pays le permet. L’éligibilité est examinée au cas par cas et soumise à un examen juridique.' },
        { q: 'Combien cela coûte-t-il ?', a: 'Les conditions dépendent de la formule et de votre situation, et sont données dans une proposition sur mesure après examen de votre candidature. Aucun prix n’est publié sur cette page.' },
        { q: 'Ma candidature est-elle acceptée automatiquement ?', a: 'Non. Les candidatures sont examinées et peuvent ou non mener à une proposition.' },
      ],
    },
    closing: { title: 'Prêt à devenir Dontalist ?', body: 'Choisissez la formule qui convient et parlez-nous de votre cabinet.' },
    legal: 'Les arrangements de franchise, de propriété, de participation d’investisseurs, de publicité et d’indépendance professionnelle sont soumis à un examen juridique et aux règles de chaque pays et de chaque profession. Rien sur cette page ne constitue une offre.',
    foot: 'Dontalist Partenariats.',
    seoTitle: 'Devenez Dontalist : partenariats pour dentistes et cabinets',
    seoDescription: 'Rejoignez la communauté professionnelle Dontalist, développez votre cabinet avec un partenariat ou construisez un cabinet Dontalist. Trois formules, examinées individuellement.',
    form: {
      title: 'Candidater', lead: 'Répondez à ce qui vous concerne. Les candidatures sont examinées et peuvent mener à une proposition sur mesure. Elles ne sont jamais acceptées automatiquement.',
      pathway: 'Formule', applicant: 'Vous êtes',
      applicants: { dentist: 'Un dentiste indépendant', clinicOwner: 'Un propriétaire ou représentant de cabinet', founder: 'Un futur fondateur de cabinet', investor: 'Un investisseur potentiellement éligible', industry: 'Un autre partenaire du secteur' },
      f: { name: 'Nom complet', email: 'E-mail', phone: 'Téléphone', country: 'Pays', city: 'Ville', licence: 'Numéro d’autorisation d’exercer ou d’inscription', clinic: 'Nom du cabinet', chairs: 'Nombre de fauteuils', project: 'Votre projet', timeline: 'Quand souhaitez-vous démarrer ?', message: 'Autre chose à nous dire' },
      optional: 'facultatif', projects: { new: 'Créer un nouveau cabinet', convert: 'Convertir un cabinet existant' },
      interests: 'Ce qui vous intéresse',
      interestOptions: {
        become: ['Réseau professionnel', 'Formation', 'Ressources pour les membres', 'Fournisseurs et partenaires', 'Achats groupés'],
        grow: ['Développement du cabinet', 'Présence numérique', 'Achats', 'Technologie', 'Formation du personnel'],
        build: ['Créer un cabinet', 'Convertir un cabinet', 'Aménagement et équipement', 'Recrutement et formation', 'Aide au lancement'],
      },
      consent: 'J’accepte d’être contacté au sujet de cette candidature. Je comprends qu’elle ne garantit pas l’acceptation et que toute proposition est soumise à un examen juridique.',
      submit: 'Préparer ma candidature', missing: 'Complétez les champs signalés.', invalid: 'Vérifiez les champs signalés.',
      reviewTitle: 'Votre candidature est prête', reviewBody: 'Rien n’a été envoyé : l’envoi en ligne n’est pas connecté dans cette version. Téléchargez votre candidature et envoyez-la à l’équipe Dontalist.',
      download: 'Télécharger la candidature', edit: 'Modifier', newOne: 'En commencer une autre', fileName: 'candidature-dontalist',
    },
  },
};
