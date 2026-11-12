import { fold } from './regional-rules';

export type InsuranceKind = 'public' | 'military' | 'mutual' | 'private' | 'other';
export const INSURANCE_KINDS: readonly InsuranceKind[] = ['public', 'military', 'mutual', 'private', 'other'];

/** One insurer in the reference list (`insurance/MA.json`) or one the clinic added itself. */
export interface InsuranceProvider { id: string; name: string; short?: string; kind: InsuranceKind; aliases?: string[]; custom?: boolean }

/** A patient's insurance as the clinic recorded it. It says who covers the patient, nothing about claims or reimbursement. */
export interface PatientInsurance { id: string; providerId: string; providerName: string; number: string; policy?: string; notes?: string; addedAt: string }

const txt = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

/** Reads a catalogue file as data: unknown fields are dropped, invalid entries skipped. */
export function parseCatalog(json: unknown): InsuranceProvider[] {
  const list = (json as { entries?: unknown })?.entries;
  if (!Array.isArray(list)) return [];
  const out: InsuranceProvider[] = [];
  for (const e of list) {
    const id = txt(e?.id, 60), name = txt(e?.name, 120);
    if (!id || !name) continue;
    const kind = INSURANCE_KINDS.includes(e.kind) ? (e.kind as InsuranceKind) : 'other';
    const aliases = Array.isArray(e.aliases) ? e.aliases.map((a: unknown) => txt(a, 80)).filter((a: string | undefined): a is string => !!a) : undefined;
    out.push({ id, name, kind, ...(txt(e.short, 30) ? { short: txt(e.short, 30) } : {}), ...(aliases?.length ? { aliases } : {}) });
  }
  return out;
}

/** Name, acronym and aliases, accents and case ignored. Starts-with matches first, then word starts, then anywhere. */
export function searchProviders(list: readonly InsuranceProvider[], query: string, limit = 8): InsuranceProvider[] {
  const q = fold(query);
  if (!q) return list.slice(0, limit);
  const scored: [number, InsuranceProvider][] = [];
  for (const p of list) {
    const rank = Math.min(...[p.name, p.short ?? '', ...(p.aliases ?? [])].filter(Boolean).map((s) => { const f = fold(s); return f.startsWith(q) ? 0 : f.split(' ').some((w) => w.startsWith(q)) ? 1 : f.includes(q) ? 2 : 9; }));
    if (rank < 9) scored.push([rank, p]);
  }
  return scored.sort((a, b) => a[0] - b[0]).slice(0, limit).map((x) => x[1]);
}

export type CustomProblem = 'name' | 'duplicate';
/** A clinic's own provider needs a name that is not already in the list. */
export function customProblem(name: string, all: readonly InsuranceProvider[]): CustomProblem | null {
  const f = fold(name);
  if (!f) return 'name';
  return all.some((p) => fold(p.name) === f || (p.short && fold(p.short) === f)) ? 'duplicate' : null;
}

export type InsuranceProblem = 'provider' | 'number';
export const insuranceProblem = (i: Pick<PatientInsurance, 'providerId' | 'number'>): InsuranceProblem | null => (!i.providerId ? 'provider' : !i.number.trim() ? 'number' : null);

export function tidyInsurance(i: PatientInsurance): PatientInsurance {
  return { id: i.id, providerId: i.providerId, providerName: txt(i.providerName, 120) ?? '', number: txt(i.number, 40) ?? '', ...(txt(i.policy, 60) ? { policy: txt(i.policy, 60) } : {}), ...(txt(i.notes, 300) ? { notes: txt(i.notes, 300) } : {}), addedAt: i.addedAt };
}
