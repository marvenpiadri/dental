import { AllergyDef, LibMedication, RxAlert, RxItem, RxTemplate } from '../models/dental.models';
import { CONDITIONS } from '../patients/patient-rules';
import { norm, tidyMedication } from './med-library';

export const LIBRARY_FORMAT = 'dontalist.library';
export const LIBRARY_SCHEMA = 1;
const MAX_BYTES = 5_000_000, MAX_RECORDS = 5000, MAX_ITEMS = 40;

export type LibraryPart = 'medications' | 'allergies' | 'templates';
export interface LibraryPackage {
  format: typeof LIBRARY_FORMAT; schemaVersion: number; exportedAt: string; appVersion: string;
  contents: LibraryPart[];
  medications: LibMedication[]; allergies: AllergyDef[]; templates: RxTemplate[];
}
export interface Libraries { medications: LibMedication[]; allergies: AllergyDef[]; templates: RxTemplate[] }

export function exportLibrary(parts: readonly LibraryPart[], data: Libraries, appVersion: string, now: string): LibraryPackage {
  const has = (p: LibraryPart) => parts.includes(p);
  return { format: LIBRARY_FORMAT, schemaVersion: LIBRARY_SCHEMA, exportedAt: now, appVersion, contents: [...parts],
    medications: has('medications') ? data.medications : [], allergies: has('allergies') ? data.allergies : [], templates: has('templates') ? data.templates : [] };
}

/* ------------------------------- reading untrusted JSON ------------------------------- */

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v.slice(0, MAX_RECORDS) : []);
const codes = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && (CONDITIONS as readonly string[]).includes(x)) : []);

export type ParseError = 'size' | 'json' | 'format' | 'version';
export type ParseResult = { ok: true; pkg: LibraryPackage; rejected: number } | { ok: false; error: ParseError };

/** Reads a library file as data only. Every field is copied through a whitelist with a length cap; unknown fields and invalid records are dropped and counted. */
export function parseLibrary(text: string): ParseResult {
  if (text.length > MAX_BYTES) return { ok: false, error: 'size' };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: 'json' }; }
  const o = obj(raw);
  if (!o || o['format'] !== LIBRARY_FORMAT) return { ok: false, error: 'format' };
  if (typeof o['schemaVersion'] !== 'number' || o['schemaVersion'] !== LIBRARY_SCHEMA) return { ok: false, error: 'version' };
  let rejected = 0;
  const keep = <T>(items: unknown[], read: (r: Record<string, unknown>) => T | null): T[] => items.flatMap((x) => { const r = obj(x); const v = r ? read(r) : null; if (!v) rejected++; return v ? [v] : []; });
  const medications = keep(list(o['medications']), (r): LibMedication | null => {
    const id = str(r['id'], 64), name = str(r['name'], 120), kind = r['kind'];
    if (!id || !ID.test(id) || !name || (kind !== 'generic' && kind !== 'brand')) return null;
    const genericId = str(r['genericId'], 64);
    if (kind === 'brand' && (!genericId || !ID.test(genericId))) return null;
    return tidyMedication({ id, kind, name, ...(kind === 'brand' ? { genericId } : { notes: str(r['notes'], 4000) }), reviewConditions: codes(r['reviewConditions']), externalId: str(r['externalId'], 80), hidden: r['hidden'] === true });
  });
  const allergies = keep(list(o['allergies']), (r): AllergyDef | null => {
    const id = str(r['id'], 64), name = str(r['name'], 120), med = str(r['medicationId'], 64);
    if (!id || !ID.test(id) || !name) return null;
    return { id, name, ...(med && ID.test(med) ? { medicationId: med } : {}), ...(str(r['externalId'], 80) ? { externalId: str(r['externalId'], 80) } : {}), ...(r['hidden'] === true ? { hidden: true } : {}) };
  });
  const templates = keep(list(o['templates']), (r): RxTemplate | null => {
    const id = str(r['id'], 64), name = str(r['name'], 120);
    if (!id || !ID.test(id) || !name) return null;
    const items = Array.isArray(r['items']) ? r['items'].slice(0, MAX_ITEMS).flatMap((x) => { const i = obj(x); return i && str(i['name'], 120) ? [readItem(i)] : []; }) : [];
    return { id, name, ...(str(r['description'], 300) ? { description: str(r['description'], 300) } : {}), items, updatedAt: str(r['updatedAt'], 40) ?? '' };
  });
  const contents = (['medications', 'allergies', 'templates'] as const).filter((p) => Array.isArray(o['contents']) && (o['contents'] as unknown[]).includes(p));
  return { ok: true, rejected, pkg: { format: LIBRARY_FORMAT, schemaVersion: LIBRARY_SCHEMA, exportedAt: str(o['exportedAt'], 40) ?? '', appVersion: str(o['appVersion'], 40) ?? '', contents: [...contents], medications, allergies, templates } };
}

const F = ['brand', 'generic', 'strength', 'form', 'route', 'dosage', 'frequency', 'duration', 'quantity', 'refills'] as const;
function readItem(i: Record<string, unknown>): RxItem {
  const out: RxItem = { id: str(i['id'], 64) ?? '', name: str(i['name'], 120)! };
  for (const k of F) { const v = str(i[k], 80); if (v) out[k] = v; }
  const ins = str(i['instructions'], 500), internal = str(i['internalNotes'], 500), med = str(i['medicationId'], 64);
  if (ins) out.instructions = ins;
  if (internal) out.internalNotes = internal;
  if (med && ID.test(med)) out.medicationId = med;
  const review = codes(i['reviewConditions']);
  if (review.length) out.reviewConditions = review;
  const alerts = Array.isArray(i['alerts']) ? i['alerts'].slice(0, 20).flatMap((x): RxAlert[] => {
    const a = obj(x), type = a?.['type'], ref = str(a?.['refId'], 64), label = str(a?.['label'], 120);
    return a && (type === 'allergy' || type === 'medication' || type === 'problem') && ref && label ? [{ id: str(a['id'], 64) ?? '', type, refId: ref, label, severity: a['severity'] === 'critical' ? 'critical' : 'warning', ...(str(a['message'], 300) ? { message: str(a['message'], 300) } : {}) }] : [];
  }) : [];
  if (alerts.length) out.alerts = alerts;
  return out;
}

/* ------------------------------------- importing ------------------------------------- */

export type RowStatus = 'new' | 'same' | 'duplicate' | 'idRemapped' | 'blocked';
export interface ImportRow { kind: 'medication' | 'allergy' | 'template'; id: string; name: string; status: RowStatus; existingId?: string; detail?: string }
export interface ImportMissing { kind: 'genericBrand' | 'allergyMedication' | 'templateMedication' | 'templateAlert'; owner: string; detail: string }
export type DuplicateChoice = 'separate' | 'existing';
export interface ImportResult {
  libraries: Libraries; rows: ImportRow[]; missing: ImportMissing[];
  added: { medications: number; allergies: number; templates: number };
}

/**
 * Adds a package to the clinic's libraries and never overwrites. Same id and same name: already there, skipped. Same id but a different record: the incoming one gets a
 * new id and everything that referred to it follows. Same name, different id: a duplicate; unless the dentist chose "use existing" it is added separately, so
 * names that merely look alike are never merged silently. Links that cannot be resolved are dropped and listed. Patient records are not an input here at all.
 * Calling it with the default choices is the preview; calling it with the final choices is the import.
 */
export function resolveImport(local: Libraries, pkg: LibraryPackage, choices: Readonly<Record<string, DuplicateChoice>>, newId: () => string): ImportResult {
  const rows: ImportRow[] = [], missing: ImportMissing[] = [];
  const meds = [...local.medications], allergies = [...local.allergies], templates = [...local.templates];
  const taken = new Set([...meds, ...allergies, ...templates].map((x) => x.id));
  const medMap = new Map<string, string>(), allergyMap = new Map<string, string>();
  const fresh = (id: string): string => { const f = taken.has(id) ? newId() : id; taken.add(f); return f; };
  const added = { medications: 0, allergies: 0, templates: 0 };
  const choice = (id: string) => choices[id] ?? 'separate';

  const addMed = (m: LibMedication, genericId?: string) => {
    const local1 = meds.find((x) => x.id === m.id);
    const under = (x: LibMedication) => m.kind === 'generic' || x.genericId === genericId;
    if (local1 && local1.kind === m.kind && norm(local1.name) === norm(m.name) && under(local1)) { medMap.set(m.id, local1.id); rows.push({ kind: 'medication', id: m.id, name: m.name, status: 'same', existingId: local1.id }); return; }
    const dup = meds.find((x) => x.kind === m.kind && norm(x.name) === norm(m.name) && under(x));
    if (dup && choice(m.id) === 'existing') { medMap.set(m.id, dup.id); rows.push({ kind: 'medication', id: m.id, name: m.name, status: 'duplicate', existingId: dup.id }); return; }
    const id = fresh(m.id);
    medMap.set(m.id, id);
    meds.push({ ...m, id, ...(m.kind === 'brand' ? { genericId } : {}) });
    added.medications++;
    rows.push({ kind: 'medication', id: m.id, name: m.name, status: dup ? 'duplicate' : id !== m.id ? 'idRemapped' : 'new', existingId: dup?.id });
  };
  for (const g of pkg.medications.filter((m) => m.kind === 'generic')) addMed(g);
  for (const b of pkg.medications.filter((m) => m.kind === 'brand')) {
    const gid = medMap.get(b.genericId!) ?? (meds.some((x) => x.id === b.genericId && x.kind === 'generic') ? b.genericId : undefined);
    if (!gid) { missing.push({ kind: 'genericBrand', owner: b.name, detail: b.genericId! }); rows.push({ kind: 'medication', id: b.id, name: b.name, status: 'blocked', detail: b.genericId }); continue; }
    addMed(b, gid);
  }

  const knownMed = (id: string | undefined) => (id ? medMap.get(id) ?? (meds.some((x) => x.id === id) ? id : undefined) : undefined);
  for (const a of pkg.allergies) {
    const local1 = allergies.find((x) => x.id === a.id);
    if (local1 && norm(local1.name) === norm(a.name)) { allergyMap.set(a.id, local1.id); rows.push({ kind: 'allergy', id: a.id, name: a.name, status: 'same', existingId: local1.id }); continue; }
    const dup = allergies.find((x) => norm(x.name) === norm(a.name));
    if (dup && choice(a.id) === 'existing') { allergyMap.set(a.id, dup.id); rows.push({ kind: 'allergy', id: a.id, name: a.name, status: 'duplicate', existingId: dup.id }); continue; }
    const id = fresh(a.id);
    const med = knownMed(a.medicationId);
    if (a.medicationId && !med) missing.push({ kind: 'allergyMedication', owner: a.name, detail: a.medicationId });
    allergyMap.set(a.id, id);
    allergies.push({ id, name: a.name, ...(med ? { medicationId: med } : {}), ...(a.externalId ? { externalId: a.externalId } : {}), ...(a.hidden ? { hidden: true } : {}) });
    added.allergies++;
    rows.push({ kind: 'allergy', id: a.id, name: a.name, status: dup ? 'duplicate' : id !== a.id ? 'idRemapped' : 'new', existingId: dup?.id });
  }

  const knownAllergy = (id: string) => allergyMap.get(id) ?? (allergies.some((x) => x.id === id) ? id : undefined);
  for (const t of pkg.templates) {
    const same = templates.find((x) => x.id === t.id && norm(x.name) === norm(t.name));
    if (same) { rows.push({ kind: 'template', id: t.id, name: t.name, status: 'same', existingId: same.id }); continue; }
    const dup = templates.find((x) => norm(x.name) === norm(t.name));
    if (dup && choice(t.id) === 'existing') { rows.push({ kind: 'template', id: t.id, name: t.name, status: 'duplicate', existingId: dup.id }); continue; }
    const items = t.items.map((i): RxItem => {
      const med = knownMed(i.medicationId);
      if (i.medicationId && !med) missing.push({ kind: 'templateMedication', owner: `${t.name}: ${i.name}`, detail: i.medicationId });
      const alerts = (i.alerts ?? []).flatMap((a): RxAlert[] => {
        const ref = a.type === 'allergy' ? knownAllergy(a.refId) : a.type === 'medication' ? knownMed(a.refId) : (CONDITIONS as readonly string[]).includes(a.refId) ? a.refId : undefined;
        if (!ref) { missing.push({ kind: 'templateAlert', owner: `${t.name}: ${i.name}`, detail: a.label }); return []; }
        return [{ ...a, id: newId(), refId: ref }];
      });
      const { medicationId: _m, alerts: _a, ...rest } = i;
      return { ...rest, id: newId(), ...(med ? { medicationId: med } : {}), ...(alerts.length ? { alerts } : {}) };
    });
    const id = fresh(t.id);
    templates.push({ id, name: t.name, ...(t.description ? { description: t.description } : {}), items, updatedAt: t.updatedAt });
    added.templates++;
    rows.push({ kind: 'template', id: t.id, name: t.name, status: dup ? 'duplicate' : id !== t.id ? 'idRemapped' : 'new', existingId: dup?.id });
  }
  return { libraries: { medications: meds, allergies, templates }, rows, missing, added };
}
