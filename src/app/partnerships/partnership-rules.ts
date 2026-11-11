/** The three partnership pathways and the pure rules of the application form (no network: the form is frontend-only for now). */
export type Pathway = 'become' | 'grow' | 'build';
export const PATHWAYS: readonly Pathway[] = ['become', 'grow', 'build'];
export type Applicant = 'dentist' | 'clinicOwner' | 'founder' | 'investor' | 'industry';

/** Who can apply to which pathway: an investor or industry partner is only meaningful for Build, or for a conversation. */
export const APPLICANTS: Record<Pathway, readonly Applicant[]> = {
  become: ['dentist', 'industry'],
  grow: ['clinicOwner', 'dentist'],
  build: ['founder', 'clinicOwner', 'investor', 'industry'],
};

export interface Application {
  pathway: Pathway;
  applicant: Applicant | '';
  name: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  /** Licence or registration number (dentists), as the applicant writes it. */
  licence: string;
  clinic: string;
  chairs: string;
  /** Build only: 'new' or 'convert'. */
  project: 'new' | 'convert' | '';
  timeline: string;
  interests: string[];
  message: string;
  consent: boolean;
}

export type Field = keyof Application;

export const emptyApplication = (pathway: Pathway): Application => ({
  pathway, applicant: '', name: '', email: '', phone: '', country: '', city: '', licence: '', clinic: '', chairs: '', project: '', timeline: '', interests: [], message: '', consent: false,
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Fields the pathway asks for, in display order. Name, email, country, city and consent are always asked. */
export function fieldsFor(pathway: Pathway, applicant: Applicant | ''): Field[] {
  const out: Field[] = ['applicant', 'name', 'email', 'phone', 'country', 'city'];
  if (applicant === 'dentist' || applicant === 'clinicOwner' || applicant === 'founder') out.push('licence');
  if (pathway !== 'become' || applicant === 'dentist') out.push('clinic');
  if (pathway === 'grow') out.push('chairs');
  if (pathway === 'build') out.push('project', 'timeline');
  out.push('interests', 'message', 'consent');
  return out;
}

/** The fields that must be filled before the application can be prepared. Everything else is optional. */
export function required(pathway: Pathway, applicant: Applicant | ''): Field[] {
  const need: Field[] = ['applicant', 'name', 'email', 'country', 'city', 'consent'];
  if (pathway === 'grow') need.push('clinic');
  if (pathway === 'build') need.push('project');
  return need.filter((f) => fieldsFor(pathway, applicant).includes(f));
}

/** The fields that are missing or invalid, empty when the application can be prepared. */
export function problems(a: Application): Field[] {
  const bad = required(a.pathway, a.applicant).filter((f) => (f === 'consent' ? !a.consent : !String(a[f]).trim()));
  if (a.email.trim() && !EMAIL.test(a.email.trim()) && !bad.includes('email')) bad.push('email');
  if (a.applicant && !APPLICANTS[a.pathway].includes(a.applicant) && !bad.includes('applicant')) bad.push('applicant');
  return bad;
}

/** What is downloaded: only the fields this pathway asked for, trimmed, with a clear status that nothing was sent or accepted. */
export function toPayload(a: Application, now: Date): Record<string, unknown> {
  const asked = fieldsFor(a.pathway, a.applicant);
  const body: Record<string, unknown> = {};
  for (const f of asked) { const v = a[f]; body[f] = typeof v === 'string' ? v.trim() : v; }
  return { format: 'dontalist.partnership-application', version: 1, createdAt: now.toISOString(), pathway: a.pathway, status: 'prepared-not-sent', ...body };
}
