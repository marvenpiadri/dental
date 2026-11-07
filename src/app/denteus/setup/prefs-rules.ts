import { APPOINTMENT_TYPES, PAYMENT_METHODS, PaymentMethod } from '../models/dental.models';

/** Clinic preferences kept in one settings row. Everything here changes a screen that already exists. */
export interface ClinicPrefs {
  /** Minutes by appointment type id; a type that is missing uses its built-in length. */
  typeMinutes: Record<string, number>;
  /** Payment methods offered when recording a payment. Payments already recorded keep their method. */
  payMethods: PaymentMethod[];
  /** How many days ahead the Today screen lists visits to remind; 0 turns the list off. */
  reminderDays: 0 | 1 | 2 | 3;
  showOwing: boolean;
  showRecall: boolean;
}

export const MIN_DURATION = 5;
export const MAX_DURATION = 480;

export const DEFAULT_PREFS: ClinicPrefs = { typeMinutes: {}, payMethods: [...PAYMENT_METHODS], reminderDays: 1, showOwing: true, showRecall: true };

/** Reads what was stored, drops anything invalid and fills the rest with defaults, so an old or odd row never breaks a screen. */
export function normalizePrefs(raw: unknown): ClinicPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<ClinicPrefs>;
  const typeMinutes: Record<string, number> = {};
  for (const [id, m] of Object.entries(r.typeMinutes ?? {})) {
    if (APPOINTMENT_TYPES.some((t) => t.id === id) && Number.isInteger(m) && m >= MIN_DURATION && m <= MAX_DURATION) typeMinutes[id] = m;
  }
  const methods = (r.payMethods ?? []).filter((m): m is PaymentMethod => (PAYMENT_METHODS as readonly string[]).includes(m));
  return {
    typeMinutes,
    payMethods: methods.length ? methods : [...DEFAULT_PREFS.payMethods],
    reminderDays: [0, 1, 2, 3].includes(r.reminderDays as number) ? (r.reminderDays as ClinicPrefs['reminderDays']) : 1,
    showOwing: r.showOwing !== false,
    showRecall: r.showRecall !== false,
  };
}

export function typeMinutes(prefs: ClinicPrefs, id: string): number {
  return prefs.typeMinutes[id] ?? APPOINTMENT_TYPES.find((t) => t.id === id)?.minutes ?? 30;
}

/** Toggling the last enabled method is refused: a clinic must be able to record a payment. */
export function toggleMethod(current: PaymentMethod[], m: PaymentMethod): PaymentMethod[] {
  if (!current.includes(m)) return PAYMENT_METHODS.filter((x) => x === m || current.includes(x));
  return current.length > 1 ? current.filter((x) => x !== m) : current;
}
