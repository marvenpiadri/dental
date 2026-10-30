import type { Patient } from '../models/dental.models';

/** Where a blank on a paper form gets its text from. `text` is typed by hand. */
export const FORM_SOURCES = [
  'patient.lastName', 'patient.firstName', 'patient.fullName', 'patient.birthDate', 'patient.sex', 'patient.phone', 'patient.email', 'patient.city',
  'patient.insurer', 'patient.insuranceNumber', 'clinic.name', 'date.today', 'total.done', 'acts.list', 'text',
] as const;
export type FormSource = (typeof FORM_SOURCES)[number];

/** A blank on the form. Position and size are fractions of the page (0..1, top-left origin) so they survive any zoom. */
export interface FormField { id: string; label: string; page: number; x: number; y: number; w: number; h: number; source: FormSource; size?: number }

/** An uploaded form (a PDF or a picture of one) and where its blanks are. Page sizes are in points. */
export interface FormTemplate { id: string; name: string; kind: 'pdf' | 'image'; file: Blob; pages: { w: number; h: number }[]; fields: FormField[] }

export interface FormContext { patient: Patient; clinic: string; today: Date; sexLabel: (s: 'female' | 'male') => string; actName: (i: { procedure: string; name?: string }) => string }

const dmy = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

/** The text a field starts with. Name order is "last first" (as written on Moroccan forms); the clinic can retype any field. */
export function sourceValue(source: FormSource, c: FormContext): string {
  const p = c.patient;
  const [last = '', ...rest] = p.fullName.trim().split(/\s+/);
  switch (source) {
    case 'patient.lastName': return last;
    case 'patient.firstName': return rest.join(' ');
    case 'patient.fullName': return p.fullName;
    case 'patient.birthDate': { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.birthDate ?? ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; }
    case 'patient.sex': return p.sex ? c.sexLabel(p.sex) : '';
    case 'patient.phone': return p.phone;
    case 'patient.email': return p.email ?? '';
    case 'patient.city': return p.city ?? '';
    case 'patient.insurer': return p.insurer ?? '';
    case 'patient.insuranceNumber': return p.insuranceNumber ?? '';
    case 'clinic.name': return c.clinic;
    case 'date.today': return dmy(c.today);
    case 'total.done': return String((p.plan ?? []).filter((i) => i.status === 'done').reduce((n, i) => n + i.price, 0));
    case 'acts.list': return (p.plan ?? []).filter((i) => i.status === 'done').map((i) => `${c.actName(i)}${i.tooth ? ' ' + i.tooth : ''}`).join(', ');
    default: return '';
  }
}

/** Guesses a field's source from the name a PDF form gave it (French or English). */
export function guessSource(name: string): FormSource {
  const n = name.toLowerCase();
  const has = (re: RegExp) => re.test(n);
  if (has(/pr[ée]nom|first/)) return 'patient.firstName';
  if (has(/naiss|birth|dob/)) return 'patient.birthDate';
  if (has(/immat|assur|matricul|cnss|cnops|member|policy|num[ée]ro/)) return 'patient.insuranceNumber';
  if (has(/t[ée]l|phone|gsm/)) return 'patient.phone';
  if (has(/mail/)) return 'patient.email';
  if (has(/ville|city/)) return 'patient.city';
  if (has(/date/)) return 'date.today';
  if (has(/montant|total|amount/)) return 'total.done';
  if (has(/acte|soin|act|treatment/)) return 'acts.list';
  if (has(/nom|name|last/)) return 'patient.lastName';
  return 'text';
}
