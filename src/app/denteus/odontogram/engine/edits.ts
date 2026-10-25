// Tooth edits as data. Each edit is validated against the source's VALID_* sets and the invariants read from
// odontogram.ts (setToothSelectionForSelection, applyRestorationSelection, setSubstrateForSelection, …).
// A rejected edit changes nothing and says why — invalid input never becomes a finding.
import { defaultState, serializeState, clampPerio, furcationEntrances, PERIO_SITES, VALID_PLAQUE_SURFACE, VALID_FURCATION_GRADE,
  VALID_TOOTH_SELECTION, VALID_TOOTH_SUBSTRATE, VALID_ENDO, VALID_PULP_DX, VALID_APICAL_DX, VALID_PERIAPICAL_TYPE, VALID_MOBILITY,
  VALID_RESORPTION_TYPE, VALID_WEAR_EDGE, VALID_WEAR_CERVICAL, VALID_DISCOLORATION, VALID_ORTHO_APPLIANCE, VALID_ORTHO_DRIFT,
  VALID_ORTHO_VERTICAL, VALID_ROOT_CARIES, VALID_PERI_IMPLANT, VALID_MODS, VALID_FILLING_MATERIAL, VALID_CARIES_SEVERITY,
  VALID_FILLING_DEFECT, VALID_CARIES, VALID_DX_OVERRIDE_VALUE, TOOTH_LEVEL_DX_KEYS } from './vendor/state/payload';
import { isValidRestoration } from './vendor/registry/restorations';
import type { ToothRecord } from './chart';

/** Source: MILKTOOTH_BLOCKED — second-dentition-only molars cannot be set as deciduous. */
const MILKTOOTH_BLOCKED = new Set([16, 17, 18, 26, 27, 28, 36, 37, 38, 46, 47, 48]);
export const SURFACES = ['buccal', 'mesial', 'occlusal', 'distal', 'lingual'] as const;

const ENUM_FIELDS = {
  mobility: VALID_MOBILITY, resorptionType: VALID_RESORPTION_TYPE, wearEdge: VALID_WEAR_EDGE, wearCervical: VALID_WEAR_CERVICAL,
  discoloration: VALID_DISCOLORATION, orthoAppliance: VALID_ORTHO_APPLIANCE, orthoDrift: VALID_ORTHO_DRIFT,
  orthoVertical: VALID_ORTHO_VERTICAL, rootCaries: VALID_ROOT_CARIES, periImplant: VALID_PERI_IMPLANT,
  periapicalType: VALID_PERIAPICAL_TYPE, apicalDx: VALID_APICAL_DX,
} as const;
export type EnumField = keyof typeof ENUM_FIELDS;

const FLAG_FIELDS = ['calculus', 'fissureSealing', 'extractionPlan', 'extractionWound', 'crownNeeded', 'crownReplace', 'crownLeakage',
  'missingClosed', 'contactMesial', 'contactDistal', 'bridgePillar', 'brokenMesial', 'brokenIncisal', 'brokenDistal',
  'endoResection', 'parapulpalPin', 'orthoRotation'] as const;
export type FlagField = (typeof FLAG_FIELDS)[number];

export type ToothEdit =
  | { kind: 'selection'; value: string }
  | { kind: 'substrate'; value: string }
  /** `type|material` (e.g. `crown|emax`), `none|none`, or `prosthesis|<value>` as in the source dropdown. */
  | { kind: 'restoration'; value: string }
  | { kind: 'caries'; surface: string; on: boolean }
  | { kind: 'cariesSeverity'; surface: string; value: number }
  | { kind: 'fillingMaterial'; value: string }
  | { kind: 'fillingSurface'; surface: string; on: boolean }
  | { kind: 'fillingDefect'; surface: string; value: string }
  | { kind: 'pulp'; value: string }
  | { kind: 'endo'; value: string }
  | { kind: 'mod'; id: string; on: boolean }
  | { kind: 'enum'; field: EnumField; value: string }
  | { kind: 'flag'; field: FlagField; on: boolean }
  | { kind: 'perio'; site: string; pd?: number | null; gm?: number; bop?: boolean; sup?: boolean }
  | { kind: 'furcation'; entrance: string; grade: number | null }
  | { kind: 'plaque'; surface: string; on: boolean }
  | { kind: 'dxOverride'; key: string; mode: 'add' | 'suppress' | null }
  | { kind: 'reset' };

export type EditResult = { ok: true; changed: boolean } | { ok: false; reason: string };
const rejected = (reason: string): EditResult => ({ ok: false, reason });
const key = (t: ToothRecord): string => JSON.stringify(serializeState(t));

/** Mutates `t` (a record the caller owns) in place. `changed` is decided by comparing serialized state. */
export function applyEdit(t: ToothRecord, toothNo: number, e: ToothEdit): EditResult {
  const before = key(t);
  const r = run(t, toothNo, e);
  if (!r.ok) return r;
  return { ok: true, changed: key(t) !== before };
}

function run(t: ToothRecord, toothNo: number, e: ToothEdit): EditResult {
  switch (e.kind) {
    case 'selection': {
      if (!VALID_TOOTH_SELECTION.has(e.value)) return rejected(`unknown tooth state "${e.value}"`);
      if (e.value === 'milktooth' && MILKTOOTH_BLOCKED.has(toothNo)) return rejected(`tooth ${toothNo} has no deciduous predecessor`);
      const next = defaultState();
      next.toothSelection = e.value;
      if (!['tooth-base', 'milktooth', 'implant', 'tooth-under-gum'].includes(e.value)) next.extractionPlan = false;
      if (e.value !== 'none') next.extractionWound = false;
      if (e.value === 'implant' || e.value === 'none') {
        next.caries.clear(); next.endo = 'none'; next.pulpDx = 'normal'; next.fillingMaterial = 'none'; next.fillingSurfaces.clear();
      }
      Object.assign(t, next);
      return { ok: true, changed: true };
    }
    case 'substrate':
      if (!VALID_TOOTH_SUBSTRATE.has(e.value)) return rejected(`unknown substrate "${e.value}"`);
      t.toothSubstrate = e.value;
      if (e.value !== 'broken') { t.brokenMesial = false; t.brokenIncisal = false; t.brokenDistal = false; }
      if (!['natural', 'broken', 'crownprep'].includes(e.value) || t.restorationType !== 'none') t.crownNeeded = false;
      return { ok: true, changed: true };
    case 'restoration': {
      if (e.value.startsWith('prosthesis|')) {
        t.prosthesis = e.value.slice('prosthesis|'.length);
        t.restorationType = 'none'; t.restorationMaterial = 'none'; t.bridgePillar = false; t.crownReplace = false;
      } else {
        const [type = 'none', material = 'none'] = e.value.split('|');
        if (type !== 'none' && !isValidRestoration(type as never, material as never, 'occlusal')) return rejected(`"${type}" in "${material}" is not a valid restoration`);
        t.restorationType = type; t.restorationMaterial = type === 'none' ? 'none' : material; t.prosthesis = 'none';
        if (type === 'none') { t.bridgePillar = false; t.crownReplace = false; } else t.crownNeeded = false;
      }
      if (t.restorationType !== 'crown' && t.restorationType !== 'bridge') t.crownLeakage = false;
      return { ok: true, changed: true };
    }
    case 'caries': {
      const surface = e.surface.replace('caries-', '');
      const id = `caries-${surface}`;
      if (!VALID_CARIES.has(id)) return rejected(`unknown caries surface "${e.surface}"`);
      if (e.on) {
        t.caries.add(id);
        if (id !== 'caries-subcrown') t.cariesSeverity.set(surface, t.cariesActiveDepth);
      } else { t.caries.delete(id); t.cariesSeverity.delete(surface); }
      return { ok: true, changed: true };
    }
    case 'cariesSeverity':
      if (!VALID_CARIES_SEVERITY.has(e.value)) return rejected('severity must be 0–6');
      if (!t.caries.has(`caries-${e.surface}`)) return rejected(`no caries recorded on ${e.surface}`);
      t.cariesSeverity.set(e.surface, e.value);
      return { ok: true, changed: true };
    case 'fillingMaterial':
      if (e.value !== 'none' && !VALID_FILLING_MATERIAL.has(e.value)) return rejected(`unknown filling material "${e.value}"`);
      t.fillingMaterial = e.value;
      if (e.value === 'none') { t.fillingSurfaces.clear(); t.fillingSurfaceMaterials.clear(); }
      return { ok: true, changed: true };
    case 'fillingSurface':
      if (!(SURFACES as readonly string[]).includes(e.surface)) return rejected(`unknown surface "${e.surface}"`);
      if (e.on && t.fillingMaterial === 'none') return rejected('choose a filling material first');
      if (e.on) { t.fillingSurfaces.add(e.surface); t.fillingSurfaceMaterials.set(e.surface, t.fillingMaterial); }
      else { t.fillingSurfaces.delete(e.surface); t.fillingSurfaceMaterials.delete(e.surface); }
      return { ok: true, changed: true };
    case 'fillingDefect':
      if (!VALID_FILLING_DEFECT.has(e.value)) return rejected(`unknown defect "${e.value}"`);
      if (!t.fillingSurfaceMaterials.has(e.surface)) return rejected(`no filling on ${e.surface}`);
      if (e.value === 'none') t.fillingDefect.delete(e.surface); else t.fillingDefect.set(e.surface, e.value);
      return { ok: true, changed: true };
    case 'pulp':
      // Source pulpEndoOnSelect: a vital-pulp diagnosis and a root filling exclude each other.
      if (!VALID_PULP_DX.has(e.value)) return rejected(`unknown pulp diagnosis "${e.value}"`);
      t.pulpDx = e.value; t.pulpLatin = 'none'; t.endo = 'none';
      return { ok: true, changed: true };
    case 'endo':
      if (e.value !== 'none' && !VALID_ENDO.has(e.value)) return rejected(`unknown endodontic status "${e.value}"`);
      t.endo = e.value;
      if (e.value !== 'none') { t.pulpDx = 'normal'; t.pulpLatin = 'none'; }
      return { ok: true, changed: true };
    case 'mod':
      if (!VALID_MODS.has(e.id)) return rejected(`unknown modifier "${e.id}"`);
      if (e.on) t.mods.add(e.id); else t.mods.delete(e.id);
      return { ok: true, changed: true };
    case 'enum': {
      const allowed: Set<string> = ENUM_FIELDS[e.field];
      if (!allowed.has(e.value)) return rejected(`unknown ${e.field} "${e.value}"`);
      t[e.field] = e.value;
      // Source setApicalDxForSelection: the lesion subtype only applies to apical periodontitis.
      if (e.field === 'apicalDx' && e.value !== 'symptomatic-apical-periodontitis' && e.value !== 'asymptomatic-apical-periodontitis') t.periapicalType = 'none';
      return { ok: true, changed: true };
    }
    case 'flag':
      if (!FLAG_FIELDS.includes(e.field)) return rejected(`unknown flag "${e.field}"`);
      t[e.field] = e.on;
      return { ok: true, changed: true };
    case 'perio': return editPerio(t, e);
    case 'furcation':
      if (!furcationEntrances(toothNo).includes(e.entrance)) return rejected(`no ${e.entrance} furcation entrance on tooth ${toothNo}`);
      if (e.grade === null) t.furcation.delete(e.entrance);
      else if (Number.isInteger(e.grade) && VALID_FURCATION_GRADE.has(e.grade)) t.furcation.set(e.entrance, e.grade);
      else return rejected('furcation grade must be 1–4');
      return { ok: true, changed: true };
    case 'plaque':
      if (!VALID_PLAQUE_SURFACE.has(e.surface)) return rejected(`unknown plaque surface "${e.surface}"`);
      if (e.on) t.plaque.add(e.surface); else t.plaque.delete(e.surface);
      return { ok: true, changed: true };
    case 'dxOverride':
      if (!TOOTH_LEVEL_DX_KEYS.has(e.key)) return rejected(`unknown diagnosis "${e.key}"`);
      if (e.mode !== null && !VALID_DX_OVERRIDE_VALUE.has(e.mode)) return rejected('override must be add or suppress');
      if (e.mode === null) t.dxOverrides.delete(e.key); else t.dxOverrides.set(e.key, e.mode);
      return { ok: true, changed: true };
    case 'reset':
      Object.assign(t, defaultState());
      return { ok: true, changed: true };
  }
}

/** Mirrors setPerioSite: pd < 1 / null un-charts the site everywhere; a non-integer pd rejects the whole call;
 *  gm/bop/sup only attach to an already-charted site. */
function editPerio(t: ToothRecord, e: Extract<ToothEdit, { kind: 'perio' }>): EditResult {
  if (!(PERIO_SITES as readonly string[]).includes(e.site)) return rejected(`unknown perio site "${e.site}"`);
  const p = t.perio;
  if ('pd' in e) {
    if (e.pd === null || e.pd === undefined || e.pd < 1) {
      p.pd.delete(e.site); p.gm.delete(e.site); p.bop.delete(e.site); p.sup.delete(e.site);
      return { ok: true, changed: true };
    }
    const pd = clampPerio('pd', e.pd);
    if (pd === null) return rejected('probing depth must be a whole number of mm');
    p.pd.set(e.site, pd);
  }
  if (!p.pd.has(e.site)) return rejected('chart a probing depth for this site first');
  if (e.gm !== undefined) {
    const gm = clampPerio('gm', e.gm);
    if (gm === null) return rejected('gingival margin must be a whole number of mm');
    p.gm.set(e.site, gm);
  }
  if (e.bop !== undefined) { if (e.bop) p.bop.add(e.site); else p.bop.delete(e.site); }
  if (e.sup !== undefined) { if (e.sup) p.sup.add(e.site); else p.sup.delete(e.site); }
  return { ok: true, changed: true };
}
