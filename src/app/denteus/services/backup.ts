import { defaultCatalog } from '../patients/treatment-rules';
import { Appointment, CatalogEntry, Chair, ClinicLocation, Dentist, Patient } from '../models/dental.models';

export const PRACTICE_KEYS = ['expenses', 'stock', 'lab', 'tasks', 'implants', 'steril'] as const;
export type PracticeData = Record<(typeof PRACTICE_KEYS)[number], unknown[]>;

/** A patient file (X-ray, scan) as it travels in a backup: the bytes are a data URL. */
export interface BackupDocument { id: string; patientId: string; name: string; type: string; size: number; addedAt: string; data: string }

export interface ClinicData {
  locations: ClinicLocation[];
  dentists: Dentist[];
  chairs: Chair[];
  patients: Patient[];
  appointments: Appointment[];
  catalog: CatalogEntry[];
  /** Optional: backups made before the Practice page or document backups don't have them. */
  practice?: PracticeData;
  documents?: BackupDocument[];
}

/** The file a clinic downloads. Dates are ISO strings, which is also what a PostgreSQL import wants. */
export interface BackupFile extends Omit<ClinicData, 'appointments'> {
  app: 'dentaleus';
  version: 1;
  exportedAt: string;
  appointments: unknown[];
}

export function makeBackup(data: ClinicData, now: Date): string {
  const file: BackupFile = { app: 'dentaleus', version: 1, exportedAt: now.toISOString(), ...data, appointments: data.appointments };
  return JSON.stringify(file, null, 2);
}

export type BackupResult = { ok: true; data: ClinicData; exportedAt: string } | { ok: false; reason: 'not-json' | 'not-a-backup' | 'newer-version' | 'damaged' };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

function toDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function reviveAppointment(raw: unknown): Appointment | null {
  if (!isRecord(raw) || !text(raw['id']) || !text(raw['patientId']) || !text(raw['dentistId']) || !text(raw['chairId'])) return null;
  const start = toDate(raw['start']);
  const end = toDate(raw['end']);
  const createdAt = toDate(raw['createdAt']) ?? start;
  if (!start || !end || !createdAt || end <= start) return null;
  const list = (value: unknown) => (Array.isArray(value) ? value.filter(isRecord) : []);
  return {
    ...(raw as unknown as Appointment),
    start,
    end,
    createdAt,
    history: list(raw['history']).map((entry) => ({ ...(entry as object), at: toDate(entry['at']) ?? start })) as Appointment['history'],
    scheduleHistory: list(raw['scheduleHistory']).map((entry) => ({
      ...(entry as object),
      at: toDate(entry['at']) ?? start,
      fromStart: toDate(entry['fromStart']) ?? start,
      toStart: toDate(entry['toStart']) ?? start,
    })) as Appointment['scheduleHistory'],
  };
}

/** Reads a backup file's text. Anything that doesn't check out is refused whole: a half-restored clinic is worse than none. */
export function parseBackup(source: string): BackupResult {
  let raw: unknown;
  try { raw = JSON.parse(source); } catch { return { ok: false, reason: 'not-json' }; }
  if (!isRecord(raw) || raw['app'] !== 'dentaleus') return { ok: false, reason: 'not-a-backup' };
  if (raw['version'] !== 1) return { ok: false, reason: 'newer-version' };

  const arrays = ['locations', 'dentists', 'chairs', 'patients', 'appointments'] as const;
  if (!arrays.every((key) => Array.isArray(raw[key]))) return { ok: false, reason: 'damaged' };

  const withId = (list: unknown[]) => list.every((item) => isRecord(item) && text(item['id']));
  const patients = raw['patients'] as unknown[];
  if (!withId(raw['locations'] as unknown[]) || !withId(raw['dentists'] as unknown[]) || !withId(raw['chairs'] as unknown[]) || !withId(patients)) return { ok: false, reason: 'damaged' };
  if (!patients.every((p) => text((p as Record<string, unknown>)['fullName']))) return { ok: false, reason: 'damaged' };

  const appointments = (raw['appointments'] as unknown[]).map(reviveAppointment);
  if (appointments.some((a) => a === null)) return { ok: false, reason: 'damaged' };

  const rawPractice = raw['practice'];
  const practice = isRecord(rawPractice) ? (Object.fromEntries(PRACTICE_KEYS.map((k) => [k, Array.isArray(rawPractice[k]) ? rawPractice[k] : []])) as PracticeData) : undefined;
  const rawDocs = raw['documents'];
  if (rawDocs !== undefined && !(Array.isArray(rawDocs) && rawDocs.every((d) => isRecord(d) && text(d['id']) && text(d['patientId']) && text(d['data'])))) return { ok: false, reason: 'damaged' };

  return {
    ok: true,
    exportedAt: typeof raw['exportedAt'] === 'string' ? raw['exportedAt'] : '',
    data: {
      locations: raw['locations'] as ClinicLocation[],
      dentists: raw['dentists'] as Dentist[],
      chairs: raw['chairs'] as Chair[],
      patients: patients as Patient[],
      appointments: appointments as Appointment[],
      // backups made before the catalog existed have none: start from the built-in acts
      practice,
      documents: rawDocs as BackupDocument[] | undefined,
      catalog: Array.isArray(raw['catalog']) && withId(raw['catalog'] as unknown[]) ? (raw['catalog'] as CatalogEntry[]) : defaultCatalog(),
    },
  };
}
