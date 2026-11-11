import type { Key } from '../../core/i18n/i18n.service';
import { AllergyDef, LibMedication, MedicalHistory, PatientAllergy, PatientMedication, Prescription, RxItem, RxSnapshot, RxTemplate } from '../models/dental.models';
import { genericOf } from './med-library';

const blank = (v: string | undefined): v is string => !!v && !!v.trim();
export const clean = (v: string | undefined): string | undefined => (blank(v) ? v.trim() : undefined);

/** A prescription line from a library entry. A brand prints as "Brand (generic)"; the line copies the names, so later library edits never change it. */
export function itemFromMedication(m: LibMedication, meds: readonly LibMedication[], id: string): RxItem {
  const g = genericOf(meds, m.id);
  const review = [...new Set([...(g?.reviewConditions ?? []), ...(m.reviewConditions ?? [])])];
  return { id, medicationId: m.id, name: m.name, ...(m.kind === 'brand' && g ? { generic: g.name } : {}), ...(review.length ? { reviewConditions: review } : {}) };
}

/** A line for a drug that is not in the list: the dentist types it. */
export const freeItem = (id: string, name = ''): RxItem => ({ id, name });

/** A template's lines as new, independent lines (fresh ids) so editing the prescription never touches the template. */
export const itemsFromTemplate = (t: RxTemplate, newId: () => string): RxItem[] => t.items.map((i) => ({ ...i, id: newId(), ...(i.alerts ? { alerts: i.alerts.map((a) => ({ ...a })) } : {}), ...(i.reviewConditions ? { reviewConditions: [...i.reviewConditions] } : {}) }));

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
 * Words that carry no identity: forms and connectors. shortcut: a short fixed list for English and French; extend it if a clinic sees a false match.
 * Used only for the patient's old free-text notes that nobody has turned into a record yet.
 */
const STOP = new Set(['acid', 'acide', 'mouthwash', 'bain', 'bouche', 'gel', 'cream', 'creme', 'tablet', 'tablets', 'capsule', 'capsules', 'comprime', 'comprimes', 'solution', 'oral', 'plus', 'avec', 'with', 'and', 'pour', 'sans', 'sodium', 'sodique', 'hydrochloride', 'chlorhydrate', 'allergy', 'allergic', 'allergie', 'allergique', 'sensitivity', 'sensible', 'intolerance', 'known', 'reaction', 'drug', 'medication', 'aux', 'des', 'les', 'une', 'the']);
const fold = (s: string): string => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
export const tokens = (s: string | undefined): string[] => (s ? fold(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)) : []);
const same = (a: string, b: string): boolean => a === b || (Math.min(a.length, b.length) >= 6 && (a.startsWith(b) || b.startsWith(a)));
const overlap = (a: readonly string[], b: readonly string[]): boolean => a.some((x) => b.some((y) => same(x, y)));
const names = (i: RxItem): string[] => [...tokens(i.name), ...tokens(i.brand), ...tokens(i.generic)];

/** The pieces of a free-text note (split on commas, semicolons, slashes and line breaks) that no record has been confirmed from yet. */
export const legacyPieces = (text: string | undefined): string[] => (text ?? '').split(/[,;\n/]+/).map((x) => x.trim()).filter(Boolean);
export const unmatchedPieces = (text: string | undefined, matched: readonly string[] | undefined): string[] => legacyPieces(text).filter((p) => !(matched ?? []).includes(p.toLowerCase()));

/** Everything the safety notes read: the patient's structured records, the libraries they point into, and the old free text. */
export interface RxContext {
  medical?: MedicalHistory;
  alert?: string;
  allergies: readonly PatientAllergy[];
  medications: readonly PatientMedication[];
  allergyDefs: readonly AllergyDef[];
  meds: readonly LibMedication[];
}

/**
 * What the dentist should look at before issuing. Everything comes from records the clinic made: an allergy the dentist linked to a medication,
 * alerts the dentist configured on the line or template, conditions the dentist marked for review. There is no pharmacology database here,
 * and no family or class rule: so no note never means safe. `conditionName` turns a condition code into its label.
 */
export function rxWarnings(ctx: RxContext, items: readonly RxItem[], conditionName: (code: string) => string): RxWarning[] {
  const out: RxWarning[] = [];
  const conditions = ctx.medical?.conditions ?? [];
  const nameOf = (id: string) => ctx.meds.find((m) => m.id === id)?.name ?? '';
  const allergyNote = unmatchedPieces(ctx.medical?.allergies, ctx.medical?.legacyMatched).join(', ');
  const medNote = unmatchedPieces(ctx.medical?.medications, ctx.medical?.legacyMatched).join(', ');
  for (const item of items) {
    if (!blank(item.name)) continue;
    const drug = itemTitle(item);
    const g = item.medicationId ? genericOf(ctx.meds, item.medicationId)?.id : undefined;
    if (g) {
      for (const a of ctx.allergies) {
        const def = ctx.allergyDefs.find((d) => d.id === a.allergyId);
        if (def?.medicationId && genericOf(ctx.meds, def.medicationId)?.id === g) out.push({ id: `allergy:${item.id}:${a.id}`, level: 'critical', key: 'rx.w.allergyLinked', params: { drug, allergy: def.name, linked: nameOf(def.medicationId) } });
      }
      for (const m of ctx.medications) if (genericOf(ctx.meds, m.medicationId)?.id === g) out.push({ id: `current:${item.id}:${m.id}`, level: 'warning', key: 'rx.w.current', params: { drug, current: m.label } });
    }
    for (const al of item.alerts ?? []) {
      const hit = al.type === 'allergy' ? ctx.allergies.some((a) => a.allergyId === al.refId)
        : al.type === 'medication' ? ctx.medications.some((m) => genericOf(ctx.meds, m.medicationId)?.id === genericOf(ctx.meds, al.refId)?.id && !!genericOf(ctx.meds, al.refId))
        : conditions.includes(al.refId);
      if (hit) out.push({ id: `alert:${item.id}:${al.id}`, level: al.severity === 'critical' ? 'critical' : 'warning', key: al.type === 'allergy' ? 'rx.w.tplAllergy' : al.type === 'medication' ? 'rx.w.tplMedication' : 'rx.w.tplProblem', params: { drug, label: al.type === 'problem' ? conditionName(al.refId) : al.label, extra: blank(al.message) ? ` ${al.message!.trim()}` : '' } });
    }
    const hit = (item.reviewConditions ?? []).filter((x) => conditions.includes(x));
    if (hit.length) out.push({ id: `condition:${item.id}`, level: 'warning', key: 'rx.w.condition', params: { drug, conditions: hit.map(conditionName).join(', ') } });
    if (allergyNote && overlap(names(item), tokens(allergyNote))) out.push({ id: `legacyAllergy:${item.id}`, level: 'warning', key: 'rx.w.legacyAllergy', params: { drug, text: allergyNote } });
    if (!g && medNote && overlap(names(item), tokens(medNote))) out.push({ id: `legacyCurrent:${item.id}`, level: 'warning', key: 'rx.w.legacyCurrent', params: { drug, text: medNote } });
  }
  if (ctx.allergies.length) out.push({ id: 'info:allergies', level: 'info', key: 'rx.w.allergies', params: { text: ctx.allergies.map((a) => a.label).join(', ') } });
  if (conditions.length) out.push({ id: 'info:conditions', level: 'info', key: 'rx.w.conditions', params: { text: conditions.map(conditionName).join(', ') } });
  if (ctx.medications.length) out.push({ id: 'info:current', level: 'info', key: 'rx.w.currentList', params: { text: ctx.medications.map((m) => m.label).join(', ') } });
  if (allergyNote || medNote) out.push({ id: 'info:legacy', level: 'info', key: 'rx.w.legacyNotes', params: { text: [allergyNote, medNote].filter(Boolean).join('; ') } });
  if (blank(ctx.alert)) out.push({ id: 'info:alert', level: 'info', key: 'rx.w.alert', params: { text: ctx.alert!.trim() } });
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
  frequency: clean(i.frequency), duration: clean(i.duration), quantity: clean(i.quantity), refills: clean(i.refills), instructions: clean(i.instructions), internalNotes: clean(i.internalNotes),
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
