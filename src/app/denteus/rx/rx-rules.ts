import type { Key } from '../../core/i18n/i18n.service';
import { MedicalHistory, Medication, Prescription, RxItem, RxSnapshot, RxTemplate } from '../models/dental.models';

const blank = (v: string | undefined): v is string => !!v && !!v.trim();
export const clean = (v: string | undefined): string | undefined => (blank(v) ? v.trim() : undefined);

export function itemFromMedication(m: Medication, id: string): RxItem {
  return { id, medicationId: m.id, name: m.name, brand: m.brand, generic: m.generic, strength: m.strength, form: m.form, route: m.route, instructions: m.instructions, aliases: m.aliases, reviewConditions: m.reviewConditions };
}

/** A line for a drug that is not in the list: the dentist types it. */
export const freeItem = (id: string, name = ''): RxItem => ({ id, name });

/** A template's lines as new, independent lines (fresh ids) so editing the prescription never touches the template. */
export const itemsFromTemplate = (t: RxTemplate, newId: () => string): RxItem[] => t.items.map((i) => ({ ...i, id: newId() }));

export function move<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list];
  const next = [...list];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

/** One readable line per medication, for lists and history: "Amoxicillin 500 mg capsule". */
export const itemTitle = (i: Pick<RxItem, 'name' | 'strength' | 'form'>): string => [i.name, i.strength, i.form].filter(blank).join(' ');

/* -------------------------------- safety notes -------------------------------- */

export type RxLevel = 'critical' | 'warning' | 'info';
export interface RxWarning { id: string; level: RxLevel; key: Key; params: Record<string, string>; }

/**
 * Words that carry no identity: forms and connectors. Without them "clavulanic acid" would match any allergy to an "acid".
 * shortcut: a short fixed list for English and French; extend it if a clinic sees a false match.
 */
const STOP = new Set(['acid', 'acide', 'mouthwash', 'bain', 'bouche', 'gel', 'cream', 'creme', 'tablet', 'tablets', 'capsule', 'capsules', 'comprime', 'comprimes', 'solution', 'oral', 'plus', 'avec', 'with', 'and', 'pour', 'sans', 'sodium', 'sodique', 'hydrochloride', 'chlorhydrate', 'allergy', 'allergic', 'allergie', 'allergique', 'sensitivity', 'sensible', 'intolerance', 'known', 'reaction', 'drug', 'medication', 'aux', 'des', 'les', 'une', 'the']);

const fold = (s: string): string => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
export const tokens = (s: string | undefined): string[] => (s ? fold(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)) : []);
/** Equal words, or one the start of the other (penicillin / penicilline), at least six letters long. */
const same = (a: string, b: string): boolean => a === b || (Math.min(a.length, b.length) >= 6 && (a.startsWith(b) || b.startsWith(a)));
const overlap = (a: readonly string[], b: readonly string[]): string | null => { for (const x of a) for (const y of b) if (same(x, y)) return x.length >= y.length ? x : y; return null; };
const identity = (i: RxItem): string[] => [...tokens(i.name), ...tokens(i.brand), ...tokens(i.generic), ...tokens(i.aliases)];

/**
 * What the dentist should look at before issuing, from what the patient file already says. It only compares text the clinic wrote:
 * there is no interaction or contraindication database, so no note never means safe. `conditionName` turns a condition code into its label.
 */
export function rxWarnings(medical: MedicalHistory | undefined, alert: string | undefined, items: readonly RxItem[], conditionName: (code: string) => string): RxWarning[] {
  const out: RxWarning[] = [];
  const allergy = tokens(medical?.allergies);
  const current = tokens(medical?.medications);
  const conditions = medical?.conditions ?? [];
  for (const item of items) {
    if (!blank(item.name)) continue;
    const id = identity(item);
    const a = overlap(id, allergy);
    if (a) out.push({ id: `allergy:${item.id}:${a}`, level: 'critical', key: 'rx.w.allergy', params: { drug: itemTitle(item), allergy: medical!.allergies!.trim() } });
    const c = overlap(id, current);
    if (c) out.push({ id: `current:${item.id}:${c}`, level: 'warning', key: 'rx.w.current', params: { drug: itemTitle(item), current: medical!.medications!.trim() } });
    const hit = (item.reviewConditions ?? []).filter((x) => conditions.includes(x));
    if (hit.length) out.push({ id: `condition:${item.id}`, level: 'warning', key: 'rx.w.condition', params: { drug: itemTitle(item), conditions: hit.map(conditionName).join(', ') } });
  }
  if (blank(medical?.allergies)) out.push({ id: 'info:allergies', level: 'info', key: 'rx.w.allergies', params: { text: medical!.allergies!.trim() } });
  if (conditions.length) out.push({ id: 'info:conditions', level: 'info', key: 'rx.w.conditions', params: { text: conditions.map(conditionName).join(', ') } });
  if (blank(medical?.medications)) out.push({ id: 'info:current', level: 'info', key: 'rx.w.currentList', params: { text: medical!.medications!.trim() } });
  if (blank(alert)) out.push({ id: 'info:alert', level: 'info', key: 'rx.w.alert', params: { text: alert!.trim() } });
  return out;
}

/* ---------------------------------- lifecycle ---------------------------------- */

export type IssueProblem = 'empty' | 'unnamed' | 'unreviewed';

/** Why a draft cannot be issued yet, or null. Every critical note must be acknowledged first. */
export function issueProblem(items: readonly RxItem[], warnings: readonly RxWarning[], acknowledged: readonly string[]): IssueProblem | null {
  if (!items.length) return 'empty';
  if (items.some((i) => !blank(i.name))) return 'unnamed';
  if (warnings.some((w) => w.level === 'critical' && !acknowledged.includes(w.id))) return 'unreviewed';
  return null;
}

export const nextRxNumber = (all: readonly Prescription[], year: number): string => {
  const prefix = `RX-${year}-`;
  const top = all.reduce((n, p) => (p.number?.startsWith(prefix) ? Math.max(n, Number(p.number.slice(prefix.length)) || 0) : n), 0);
  return `${prefix}${String(top + 1).padStart(4, '0')}`;
};

/** Trims text fields and drops empty ones, so what is issued is exactly what was typed. */
export const tidyItem = (i: RxItem): RxItem => ({
  ...i, name: i.name.trim(), brand: clean(i.brand), generic: clean(i.generic), strength: clean(i.strength), form: clean(i.form), route: clean(i.route), dosage: clean(i.dosage),
  frequency: clean(i.frequency), duration: clean(i.duration), quantity: clean(i.quantity), refills: clean(i.refills), instructions: clean(i.instructions), aliases: clean(i.aliases),
});

/**
 * Issues a draft inside a patient's list: freezes lines and the who-and-for-whom snapshot, assigns the number, and, when the draft corrects an
 * earlier prescription, marks that one superseded. The original's content is never touched.
 */
export function applyIssue(list: readonly Prescription[], id: string, number: string, snapshot: RxSnapshot, acknowledged: readonly string[], now: string): Prescription[] {
  const draft = list.find((p) => p.id === id);
  if (!draft || draft.status !== 'draft') return [...list];
  return list.map((p) => {
    if (p.id === id) return { ...p, status: 'issued', number, issuedAt: now, updatedAt: now, items: p.items.map(tidyItem), snapshot, acknowledged: [...acknowledged] };
    if (p.id === draft.correctsId && p.status === 'issued') return { ...p, status: 'superseded', supersededById: id, updatedAt: now };
    return p;
  });
}

/** A new draft that corrects an issued prescription. The original stays as it was until the correction is issued. */
export function startCorrection(original: Prescription, id: string, reason: string, now: string, newId: () => string): Prescription {
  return { id, status: 'draft', createdAt: now, updatedAt: now, dentistId: original.dentistId, appointmentId: original.appointmentId, items: original.items.map((i) => ({ ...i, id: newId() })), notes: original.notes, correctsId: original.id, correctionReason: reason.trim() };
}

/** Voids an issued prescription with a reason. It stays in the history. */
export const voidPrescription = (list: readonly Prescription[], id: string, reason: string, now: string): Prescription[] =>
  !reason.trim() ? [...list] : list.map((p) => (p.id === id && p.status === 'issued' ? { ...p, status: 'voided', voidedAt: now, voidReason: reason.trim(), updatedAt: now } : p));
