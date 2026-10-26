// Periodontal summary and 2017 classification for one chart. Pure; the derivation is the library's.
// The result is a *suggestion*: a clinician override per axis wins and is flagged as such.
import { ALL_TEETH, type Chart } from './chart';
import { isToothPresent } from './vendor/state/payload';
import { derivePerioClassification, type PerioClassification, type ToothDerivationInput } from './vendor/perioClassification';

export interface CaseMeta {
  age: number | null;
  smokingStatus: 'unknown' | 'never' | 'former' | 'current';
  cigarettesPerDay: number | null;
  diabetesStatus: 'unknown' | 'none' | 'present';
  hba1c: number | null;
  toothLossPerio: number | null;
  maxRblPercent: number | null;
  diagnosisOverride: string | null;
  stageOverride: string | null;
  gradeOverride: string | null;
  extentOverride: string | null;
}

const SMOKING = ['unknown', 'never', 'former', 'current'] as const;
const DIABETES = ['unknown', 'none', 'present'] as const;
const OVERRIDES = { diagnosisOverride: ['health', 'gingivitis', 'periodontitis'], stageOverride: ['I', 'II', 'III', 'IV'], gradeOverride: ['A', 'B', 'C'], extentOverride: ['localized', 'generalized', 'molar-incisor'] } as const;
export const OVERRIDE_VALUES = OVERRIDES;

const int = (v: unknown, lo: number, hi: number): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : null;
};
const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Same bounds as the source's hydrateCaseMeta; anything unrecognised reads as "not set". */
export function readCaseMeta(raw: unknown): CaseMeta {
  const r = rec(raw);
  const h = Number(r['hba1c']);
  const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | null => (allowed.includes(v as T) ? (v as T) : null);
  return {
    age: int(r['age'], 0, 120),
    smokingStatus: pick(r['smokingStatus'], SMOKING) ?? 'unknown',
    cigarettesPerDay: int(r['cigarettesPerDay'], 0, 99),
    diabetesStatus: pick(r['diabetesStatus'], DIABETES) ?? 'unknown',
    hba1c: r['hba1c'] === null || r['hba1c'] === undefined || !Number.isFinite(h) ? null : Math.max(3, Math.min(20, Math.round(h * 10) / 10)),
    toothLossPerio: int(r['toothLossPerio'], 0, 32),
    maxRblPercent: int(r['maxRblPercent'], 0, 100),
    diagnosisOverride: pick(r['diagnosisOverride'], OVERRIDES.diagnosisOverride),
    stageOverride: pick(r['stageOverride'], OVERRIDES.stageOverride),
    gradeOverride: pick(r['gradeOverride'], OVERRIDES.gradeOverride),
    extentOverride: pick(r['extentOverride'], OVERRIDES.extentOverride),
  };
}

/** Returns a new chart whose case data has `patch` applied (validated); fields this module does not know are kept. */
export function patchCaseMeta(chart: Chart, patch: Partial<CaseMeta>): Chart {
  const merged = readCaseMeta({ ...rec(chart.caseMeta), ...patch });
  const out: Record<string, unknown> = { ...rec(chart.caseMeta) };
  for (const [k, v] of Object.entries(merged)) {
    if (v === null || v === 'unknown') delete out[k]; else out[k] = v; // omit-when-empty, as in the source payload
  }
  return { ...chart, caseMeta: Object.keys(out).length ? out : undefined };
}

export interface PerioSummary { chartedSites: number; bleedingSites: number; bopPercent: number; maxPd: number | null; maxFurcation: number | null }

export function perioSummary(chart: Chart): PerioSummary {
  let charted = 0, bleeding = 0, maxPd = 0, maxFurc = 0;
  for (const n of ALL_TEETH) {
    const t = chart.status.get(n);
    if (!t || !isToothPresent(t.toothSelection)) continue;
    for (const [site, pd] of t.perio.pd as Map<string, number>) {
      charted++;
      if (t.perio.bop.has(site)) bleeding++;
      maxPd = Math.max(maxPd, pd);
    }
    for (const g of (t.furcation as Map<string, number>).values()) maxFurc = Math.max(maxFurc, g);
  }
  return { chartedSites: charted, bleedingSites: bleeding, bopPercent: charted ? Math.round((bleeding / charted) * 1000) / 10 : 0, maxPd: charted ? maxPd : null, maxFurcation: maxFurc || null };
}

export interface IndexSummary { olearyPercent: number | null; meanPi: number | null; meanGi: number | null }

/**
 * O'Leary = plaque surfaces / (4 × present teeth). Silness-Löe PI and Löe-Silness GI are averaged over
 * teeth with at least one graded surface (an ungraded surface counts as 0, the format has no "not scored").
 * shortcut: no per-tooth index-teeth subset (Ramfjord), add if a protocol asks for it.
 */
export function indexSummary(chart: Chart): IndexSummary {
  let present = 0, plaque = 0;
  const sum = { pi: 0, gi: 0 }, n = { pi: 0, gi: 0 };
  for (const num of ALL_TEETH) {
    const t = chart.status.get(num);
    if (!t || !isToothPresent(t.toothSelection)) continue;
    present++;
    plaque += t.plaque.size;
    for (const k of ['pi', 'gi'] as const) {
      const m = t[k] as Map<string, number>;
      if (m.size) { sum[k] += [...m.values()].reduce((a, b) => a + b, 0) / 4; n[k]++; }
    }
  }
  const r = (v: number) => Math.round(v * 100) / 100;
  return {
    olearyPercent: present && plaque ? Math.round((plaque / (present * 4)) * 1000) / 10 : present ? 0 : null,
    meanPi: n.pi ? r(sum.pi / n.pi) : null,
    meanGi: n.gi ? r(sum.gi / n.gi) : null,
  };
}

export interface PerioClassificationResult {
  diagnosis: string; stage: string; grade: string; extent: string;
  derived: PerioClassification;
  overridden: { diagnosis: boolean; stage: boolean; grade: boolean; extent: boolean };
}

/** null when nothing has been probed: a classification needs data, so none is invented. */
export function classifyPerio(chart: Chart): PerioClassificationResult | null {
  const s = perioSummary(chart);
  if (!s.chartedSites) return null;
  const teeth: ToothDerivationInput[] = ALL_TEETH.map((toothNo) => {
    const t = chart.status.get(toothNo);
    let interdentalCal = 0, buccalOralCal = 0, maxPd = 0;
    if (t) {
      for (const [site, pd] of t.perio.pd as Map<string, number>) {
        const cal = pd + ((t.perio.gm as Map<string, number>).get(site) ?? 0);
        if (site === 'B' || site === 'L') buccalOralCal = Math.max(buccalOralCal, cal); else interdentalCal = Math.max(interdentalCal, cal);
        maxPd = Math.max(maxPd, pd);
      }
    }
    return { toothNo, interdentalCal, buccalOralCal, maxPd, present: !!t && isToothPresent(t.toothSelection) };
  });
  const m = readCaseMeta(chart.caseMeta);
  const derived = derivePerioClassification({
    teeth, bopPercent: s.bopPercent, maxFurcation: s.maxFurcation,
    meta: { age: m.age, maxRblPercent: m.maxRblPercent, toothLossPerio: m.toothLossPerio, smokingStatus: m.smokingStatus, cigarettesPerDay: m.cigarettesPerDay, diabetesStatus: m.diabetesStatus, hba1c: m.hba1c },
  });
  return {
    diagnosis: m.diagnosisOverride ?? derived.diagnosis, stage: m.stageOverride ?? derived.stage, grade: m.gradeOverride ?? derived.grade, extent: m.extentOverride ?? derived.extent,
    derived,
    overridden: { diagnosis: !!m.diagnosisOverride, stage: !!m.stageOverride, grade: !!m.gradeOverride, extent: !!m.extentOverride },
  };
}
