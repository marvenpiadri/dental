import { AllergyDef, AuditEntry, LibMedication, Patient, PatientAllergy, PatientMedication, RxAlert, RxTemplate } from '../models/dental.models';

const txt = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
export const norm = (s: string): string => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
export const audit = (what: string, now: string, note?: string): AuditEntry => ({ at: now, what, ...(note ? { note } : {}) });

type Refs = Pick<Patient, 'id' | 'fullName' | 'patientAllergies' | 'patientMedications'>;
export const liveAllergies = (p: Pick<Patient, 'patientAllergies'>): PatientAllergy[] => (p.patientAllergies ?? []).filter((a) => !a.removedAt);
export const liveMedications = (p: Pick<Patient, 'patientMedications'>): PatientMedication[] => (p.patientMedications ?? []).filter((m) => !m.removedAt);
export const activeAllergies = (p: Pick<Patient, 'patientAllergies'>): PatientAllergy[] => liveAllergies(p).filter((a) => a.active);
export const activeMedications = (p: Pick<Patient, 'patientMedications'>): PatientMedication[] => liveMedications(p).filter((m) => m.active);

/* --------------------------------- medications --------------------------------- */

/** The generic a medication belongs to: itself for a generic, its parent for a brand. */
export function genericOf(meds: readonly LibMedication[], id: string | undefined): LibMedication | undefined {
  const m = meds.find((x) => x.id === id);
  return m?.kind === 'brand' ? meds.find((x) => x.id === m.genericId && x.kind === 'generic') : m;
}
/** "Brand (generic)" for a brand, the plain name for a generic. */
export const displayName = (meds: readonly LibMedication[], m: LibMedication): string =>
  m.kind === 'brand' ? `${m.name} (${genericOf(meds, m.id)?.name ?? '?'})` : m.name;

export type MedProblem = 'name' | 'generic' | 'duplicate';
/** Why a medication cannot be saved, or null. A brand needs an existing generic; names are unique within a kind (case and accents ignored). */
export function medProblem(meds: readonly LibMedication[], m: LibMedication): MedProblem | null {
  if (!m.name.trim()) return 'name';
  if (m.kind === 'brand' && !meds.some((x) => x.id === m.genericId && x.kind === 'generic')) return 'generic';
  if (meds.some((x) => x.id !== m.id && x.kind === m.kind && norm(x.name) === norm(m.name) && (m.kind === 'generic' || x.genericId === m.genericId))) return 'duplicate';
  return null;
}

export function tidyMedication(m: LibMedication): LibMedication {
  const out: LibMedication = { id: m.id, kind: m.kind, name: m.name.trim() };
  if (m.kind === 'brand') out.genericId = m.genericId;
  else if (txt(m.notes)) out.notes = m.notes!.trim();
  if (m.reviewConditions?.length) out.reviewConditions = m.reviewConditions;
  if (m.hidden) out.hidden = true;
  if (txt(m.externalId)) out.externalId = m.externalId!.trim();
  return out;
}

/** What points at a medication, from actual record references (never text). */
export interface MedDependencies {
  brands: LibMedication[];
  patientsTaking: { id: string; name: string }[];
  patientsAllergic: { id: string; name: string }[];
  allergyDefs: AllergyDef[];
  templates: RxTemplate[];
}
export function medDependencies(id: string, meds: readonly LibMedication[], defs: readonly AllergyDef[], templates: readonly RxTemplate[], patients: readonly Refs[]): MedDependencies {
  const linked = defs.filter((d) => d.medicationId === id);
  const ids = new Set(linked.map((d) => d.id));
  const who = (list: readonly Refs[], has: (p: Refs) => boolean) => list.filter(has).map((p) => ({ id: p.id, name: p.fullName }));
  return {
    brands: meds.filter((m) => m.kind === 'brand' && m.genericId === id),
    patientsTaking: who(patients, (p) => liveMedications(p).some((x) => x.medicationId === id)),
    patientsAllergic: who(patients, (p) => liveAllergies(p).some((a) => ids.has(a.allergyId))),
    allergyDefs: linked,
    templates: templates.filter((t) => t.items.some((i) => i.medicationId === id || i.alerts?.some((a) => a.type === 'medication' && a.refId === id))),
  };
}
export type DeleteBlock = 'brands' | 'patients' | 'allergies' | 'templates';
export function medDeleteBlocks(d: MedDependencies): DeleteBlock[] {
  return [d.brands.length && 'brands', (d.patientsTaking.length || d.patientsAllergic.length) && 'patients', d.allergyDefs.length && 'allergies', d.templates.length && 'templates'].filter(Boolean) as DeleteBlock[];
}

/* ---------------------------------- allergies ---------------------------------- */

export interface AllergyDependencies { patients: { id: string; name: string }[]; templates: RxTemplate[] }
export function allergyDependencies(id: string, templates: readonly RxTemplate[], patients: readonly Refs[]): AllergyDependencies {
  return {
    patients: patients.filter((p) => liveAllergies(p).some((a) => a.allergyId === id)).map((p) => ({ id: p.id, name: p.fullName })),
    templates: templates.filter((t) => t.items.some((i) => i.alerts?.some((a) => a.type === 'allergy' && a.refId === id))),
  };
}
export const allergyInUse = (d: AllergyDependencies): boolean => d.patients.length > 0 || d.templates.length > 0;

export function allergyProblem(defs: readonly AllergyDef[], a: AllergyDef): 'name' | 'duplicate' | null {
  if (!a.name.trim()) return 'name';
  return defs.some((x) => x.id !== a.id && norm(x.name) === norm(a.name)) ? 'duplicate' : null;
}

const dedupeAlerts = (alerts: RxAlert[]): RxAlert[] => alerts.filter((a, i) => alerts.findIndex((b) => b.type === a.type && b.refId === a.refId) === i);

/**
 * Folds `fromId` into `toId`: patient records and template alerts are re-pointed, the retained definition adopts a medication link it lacked,
 * and each patient record keeps a history line saying what it was merged from. The caller confirms first; this cannot be undone.
 */
export function mergeAllergies(defs: readonly AllergyDef[], patients: readonly Patient[], templates: readonly RxTemplate[], fromId: string, toId: string, now: string) {
  const from = defs.find((d) => d.id === fromId), to = defs.find((d) => d.id === toId);
  if (!from || !to || fromId === toId) return { defs: [...defs], patients: [...patients], templates: [...templates], moved: 0 };
  let moved = 0;
  const nextPatients = patients.map((p) => {
    if (!p.patientAllergies?.some((a) => a.allergyId === fromId)) return p;
    const list = p.patientAllergies.map((a) => { if (a.allergyId !== fromId) return a; moved++; return { ...a, allergyId: toId, history: [...a.history, audit('merged', now, from.name)] }; });
    return { ...p, patientAllergies: list };
  });
  const nextTemplates = templates.map((t) => t.items.some((i) => i.alerts?.some((a) => a.type === 'allergy' && a.refId === fromId))
    ? { ...t, items: t.items.map((i) => (i.alerts ? { ...i, alerts: dedupeAlerts(i.alerts.map((a) => (a.type === 'allergy' && a.refId === fromId ? { ...a, refId: toId, label: to.name } : a))) } : i)) }
    : t);
  const nextDefs = defs.filter((d) => d.id !== fromId).map((d) => (d.id === toId ? { ...d, medicationId: d.medicationId ?? from.medicationId, externalId: d.externalId ?? from.externalId, hidden: d.hidden && from.hidden ? true : undefined } : d));
  return { defs: nextDefs, patients: nextPatients, templates: nextTemplates, moved };
}

/* -------------------------------- legacy migration -------------------------------- */

/**
 * The medication list as stored. Entries from the first prescription version are flat ({name, brand, generic, strength...});
 * each becomes a generic, plus a brand under it when a brand is known. Ids are kept for the entry the old `name` described, so templates
 * and prescription lines that pointed at it still resolve. Nothing the dentist typed is dropped: strength, form, route and instructions move into the generic's notes.
 */
export function readMedications(raw: unknown, newId: () => string): { list: LibMedication[]; migrated: boolean } {
  if (!Array.isArray(raw)) return { list: [], migrated: false };
  const list: LibMedication[] = [];
  let migrated = false;
  const generic = (name: string, id?: string): LibMedication => {
    const hit = list.find((m) => m.kind === 'generic' && norm(m.name) === norm(name));
    if (hit) return hit;
    const g: LibMedication = { id: id ?? newId(), kind: 'generic', name };
    list.push(g);
    return g;
  };
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object' || typeof r['id'] !== 'string') continue;
    const name = txt(r['name']);
    if (!name) continue;
    if (r['kind'] === 'generic' || r['kind'] === 'brand') {
      const m: LibMedication = { id: r['id'], kind: r['kind'], name, genericId: txt(r['genericId']), notes: txt(r['notes']), reviewConditions: Array.isArray(r['reviewConditions']) ? (r['reviewConditions'] as unknown[]).filter((x): x is string => typeof x === 'string') : undefined, hidden: r['hidden'] === true ? true : undefined, externalId: txt(r['externalId']) };
      list.push(tidyMedication(m));
      continue;
    }
    migrated = true;
    const gName = txt(r['generic']) ?? name;
    const gIsName = norm(gName) === norm(name);
    const detail = [txt(r['strength']), txt(r['form']), txt(r['route'])].filter(Boolean).join(' ');
    const note = [detail, txt(r['instructions'])].filter(Boolean).join('. ');
    const g = generic(gName, gIsName ? (r['id'] as string) : undefined);
    if (note) g.notes = [g.notes, note].filter(Boolean).join('\n');
    const review = Array.isArray(r['reviewConditions']) ? (r['reviewConditions'] as unknown[]).filter((x): x is string => typeof x === 'string') : [];
    if (review.length) g.reviewConditions = [...new Set([...(g.reviewConditions ?? []), ...review])];
    if (r['archivedAt']) g.hidden = true;
    const brands = [gIsName ? undefined : name, txt(r['brand'])].filter((b): b is string => !!b && norm(b) !== norm(gName));
    brands.forEach((b, i) => { if (!list.some((m) => m.kind === 'brand' && m.genericId === g.id && norm(m.name) === norm(b))) list.push({ id: !gIsName && i === 0 ? (r['id'] as string) : newId(), kind: 'brand', name: b, genericId: g.id, ...(r['archivedAt'] ? { hidden: true } : {}) }); });
  }
  return { list, migrated };
}
