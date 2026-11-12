/**
 * Optional regional and external services. Nothing here is required to use Dontalist, and nothing is
 * connected in this version: the registry exists so each service has a place, a description and an honest status.
 * Secrets never live in the browser: credentials will be handled by a secure backend, which does not exist yet.
 */
export type IntegrationCategory = 'insurance' | 'government' | 'payments' | 'messaging' | 'regional';
export type IntegrationStatus = 'builtIn' | 'planned';

export interface Integration {
  id: string;
  category: IntegrationCategory;
  /** ISO country codes it applies to; `*` means every clinic. */
  countries: readonly string[] | '*';
  /** `builtIn` works today without any connection; `planned` is not available yet. */
  status: IntegrationStatus;
}

export const INTEGRATIONS: readonly Integration[] = [
  { id: 'whatsapp', category: 'messaging', countries: '*', status: 'builtIn' },
  { id: 'places', category: 'regional', countries: '*', status: 'planned' },
  { id: 'us-clearinghouse', category: 'insurance', countries: ['US'], status: 'planned' },
  { id: 'fr-assurance-maladie', category: 'government', countries: ['FR'], status: 'planned' },
  { id: 'ma-cnss', category: 'government', countries: ['MA'], status: 'planned' },
  { id: 'ae-insurers', category: 'insurance', countries: ['AE'], status: 'planned' },
  { id: 'payment-gateway', category: 'payments', countries: '*', status: 'planned' },
];

/** Only what is relevant to the clinic's country: a Moroccan clinic is not shown an American clearinghouse. */
export const relevantIntegrations = (country: string | undefined): Integration[] =>
  INTEGRATIONS.filter((i) => i.countries === '*' || (!!country && i.countries.includes(country.toUpperCase())));
