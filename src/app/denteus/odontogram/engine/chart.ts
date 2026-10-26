// CRM dental engine — chart model. Pure: no DOM, no Angular, no module state, so two
// patients can never share a chart. Tooth rules live in ./vendor (angular-advanced-odontogram, MIT).
import { defaultState, hydrateState, isLegacyPayloadVersion, serializeState } from './vendor/state/payload';
import { ALL_TEETH } from './vendor/anatomy/profiles';

export const PAYLOAD_VERSION = '2.22';
export { ALL_TEETH };

export type ToothRecord = ReturnType<typeof defaultState>;
export type SerializedTooth = ReturnType<typeof serializeState>;
export type TeethMap = Map<number, ToothRecord>;

export interface ChartGlobals {
  wisdomVisible: boolean;
  showBase: boolean;
  occlusalVisible: boolean;
  showHealthyPulp: boolean;
  edentulous: boolean;
}

/** One dental chart: findings (status) and, optionally, proposed treatment (plan). */
export interface Chart {
  status: TeethMap;
  /** null until a plan exists; a plan is never inferred from status. */
  plan: TeethMap | null;
  globals: ChartGlobals;
  /** Case-level metadata (age, smoking, perio overrides…) kept opaque so nothing is lost on a round trip. */
  caseMeta: unknown;
}

export interface ChartPayload {
  version: string;
  globals: ChartGlobals;
  teeth: Record<string, SerializedTooth>;
  plan?: Record<string, SerializedTooth>;
  case?: unknown;
}

export interface ImportIssue { path: string; message: string }
export interface ReadResult { chart: Chart | null; issues: ImportIssue[] }

const DEFAULT_GLOBALS: ChartGlobals = {
  wisdomVisible: true, showBase: false, occlusalVisible: true, showHealthyPulp: true, edentulous: false,
};
// Fields the source migrates on purpose for pre-2.0 payloads; a changed value there is not a data fault.
const MIGRATED = new Set(['crownMaterial', 'bridgeUnit', 'cariesSeverity', 'secondaryCaries']);

export function newChart(): Chart {
  const status: TeethMap = new Map();
  for (const n of ALL_TEETH) status.set(n, defaultState());
  return { status, plan: null, globals: { ...DEFAULT_GLOBALS }, caseMeta: undefined };
}

export function cloneTeeth(src: TeethMap): TeethMap {
  const out: TeethMap = new Map();
  // serialize→hydrate is the source's own deep copy; legacy inference off because the state is already hydrated.
  for (const [n, s] of src) out.set(n, hydrateState(serializeState(s), false));
  return out;
}

export function cloneChart(c: Chart): Chart {
  return {
    status: cloneTeeth(c.status),
    plan: c.plan ? cloneTeeth(c.plan) : null,
    globals: { ...c.globals },
    caseMeta: c.caseMeta === undefined ? undefined : structuredClone(c.caseMeta),
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function readTeeth(raw: unknown, path: string, legacy: boolean, issues: ImportIssue[]): TeethMap {
  const out: TeethMap = new Map();
  const teeth = isRecord(raw) ? raw : {};
  if (raw !== undefined && !isRecord(raw)) issues.push({ path, message: 'expected an object keyed by FDI tooth number' });
  for (const key of Object.keys(teeth)) {
    if (!ALL_TEETH.includes(Number(key))) issues.push({ path: `${path}.${key}`, message: 'unknown tooth number, ignored' });
  }
  for (const n of ALL_TEETH) {
    const rawTooth = teeth[String(n)];
    if (rawTooth === undefined) { out.set(n, defaultState()); continue; }
    if (!isRecord(rawTooth)) {
      issues.push({ path: `${path}.${n}`, message: 'tooth record is not an object, reset to healthy' });
      out.set(n, defaultState());
      continue;
    }
    // hydrateState may rewrite the input while migrating, so give it a copy.
    const hydrated = hydrateState(structuredClone(rawTooth), legacy);
    if (!legacy) {
      const back = serializeState(hydrated) as Record<string, unknown>;
      for (const k of Object.keys(back)) {
        const before = rawTooth[k];
        if (MIGRATED.has(k) || typeof before !== 'string' || before === back[k]) continue;
        issues.push({ path: `${path}.${n}.${k}`, message: `unrecognised value "${before}", reset to "${String(back[k])}"` });
      }
    }
    out.set(n, hydrated);
  }
  return out;
}

/** Validate and load a stored/imported chart. `chart` is null when the payload is unusable — never an empty chart posing as data. */
export function readChart(raw: unknown): ReadResult {
  const issues: ImportIssue[] = [];
  if (!isRecord(raw)) return { chart: null, issues: [{ path: '', message: 'payload is not an object' }] };
  if (!isRecord(raw['teeth'])) return { chart: null, issues: [{ path: 'teeth', message: 'missing teeth section' }] };
  const legacy = isLegacyPayloadVersion(raw['version']);
  const g = isRecord(raw['globals']) ? raw['globals'] : {};
  const globals = { ...DEFAULT_GLOBALS };
  for (const k of Object.keys(DEFAULT_GLOBALS) as (keyof ChartGlobals)[]) {
    const v = g[k];
    if (typeof v === 'boolean') globals[k] = v;
    else if (v !== undefined) issues.push({ path: `globals.${k}`, message: 'expected a boolean, default used' });
  }
  return {
    chart: {
      status: readTeeth(raw['teeth'], 'teeth', legacy, issues),
      plan: isRecord(raw['plan']) ? readTeeth(raw['plan'], 'plan', legacy, issues) : null,
      globals,
      caseMeta: raw['case'],
    },
    issues,
  };
}

function writeTeeth(m: TeethMap): Record<string, SerializedTooth> {
  const out: Record<string, SerializedTooth> = {};
  for (const n of ALL_TEETH) out[n] = serializeState(m.get(n) ?? defaultState());
  return out;
}

/** Plain-JSON form (IndexedDB / backup safe). A plan identical to status is omitted, as in the source. */
export function writeChart(c: Chart): ChartPayload {
  const teeth = writeTeeth(c.status);
  const plan = c.plan ? writeTeeth(c.plan) : null;
  return {
    version: PAYLOAD_VERSION,
    globals: { ...c.globals },
    teeth,
    ...(c.caseMeta === undefined ? {} : { case: c.caseMeta }),
    ...(plan && JSON.stringify(plan) !== JSON.stringify(teeth) ? { plan } : {}),
  };
}
