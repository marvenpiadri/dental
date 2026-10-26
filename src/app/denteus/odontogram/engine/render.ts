// Paints one tooth's state onto its SVG artwork by toggling `data-active` layers. Port of the source's
// applyStateToSvgSingle (core/odontogram.ts), minus warnings UI and the measured-anatomy dentin sync.
// Rendering reads clinical state; it never owns or changes it. Browser-only (needs a DOM SVG element).
import type { ToothRecord } from './chart';
import { isExtraction, isToothPresent, isUnderGum } from './vendor/state/payload';
import { allClearLayers } from './vendor/registry/svgLayers';
import { composeRestorationLayers } from './vendor/registry/restorations';
import { applyFlagLayers, buildFlagCtx } from './vendor/registry/svgActivate';

export interface PaintOptions { showBase: boolean; showHealthyPulp: boolean }

const FISSURE_ALLOWED = new Set([14, 15, 16, 17, 24, 25, 26, 27, 34, 35, 36, 37, 44, 45, 46, 47]);
const BROKEN_VARIANTS = new Set(['tooth-broken-incisal', 'tooth-broken-distal-incisal', 'tooth-broken-distal', 'tooth-broken-mesial-incisal', 'tooth-broken-mesial']);
const WRAPPER: Record<string, string> = {
  emax: 'emax', gold: 'gold', gradia: 'gradia', zircon: 'zircon', metal: 'metal', 'metal-ceramic': 'metal-ceramic', telescope: 'telescope', temporary: 'temporary-restorations',
};
const TINT: Record<string, string> = { tetracycline: '#9c8f7a', fluorosis: '#d9c9a3', nonvital: '#a89a8a', extrinsic: '#c2a86a', other: '#b5a894' };

const brokenVariant = (s: ToothRecord): string | null => {
  const m = !!s.brokenMesial, i = !!s.brokenIncisal, d = !!s.brokenDistal;
  if (m && d && i) return 'tooth-broken-mesial-distal-incisal';
  if (m && d) return 'tooth-broken-mesial-distal';
  if (d && i) return 'tooth-broken-distal-incisal';
  if (m && i) return 'tooth-broken-mesial-incisal';
  if (d) return 'tooth-broken-distal';
  if (m) return 'tooth-broken-mesial';
  return i ? 'tooth-broken-incisal' : null;
};
const icdasTier = (code: number): 1 | 2 | 3 => (code <= 2 ? 1 : code <= 4 ? 2 : 3);
const discolorationAllowed = (s: ToothRecord): boolean =>
  (s.toothSelection === 'tooth-base' || s.toothSelection === 'milktooth') && s.restorationType === 'none' && s.toothSubstrate === 'natural';
const orthoAllowed = (s: ToothRecord): boolean => s.toothSelection === 'tooth-base' || s.toothSelection === 'milktooth';

const byId = (root: ParentNode, id: string): SVGElement | null => root.querySelector<SVGElement>(`[id="${id}"]`);
const setActive = (el: Element | null, on: boolean): void => { el?.setAttribute('data-active', on ? '1' : '0'); };

/** Run once on a freshly parsed template (port of the source's stripDisplayNoneToDataActive + ensureDataActiveForSwitchables):
 *  the artwork hides layers with inline display:none; the painter drives visibility with data-active instead. */
export function prepareArt(svg: SVGElement): void {
  for (const n of Array.from(svg.querySelectorAll<SVGElement>('[id]'))) {
    const style = n.getAttribute('style');
    if (style && /display\s*:\s*none/i.test(style)) {
      n.setAttribute('data-active', '0');
      const rest = style.replace(/display\s*:\s*none\s*;?/gi, '').replace(/;;+/g, ';').trim();
      if (rest) n.setAttribute('style', rest); else n.removeAttribute('style');
    }
  }
  for (const g of ['mods', 'tooth-variants', 'endos', 'surfaces', 'restorations', 'specials']) {
    for (const n of Array.from(byId(svg, g)?.querySelectorAll('[id]') ?? [])) if (!n.hasAttribute('data-active')) n.setAttribute('data-active', '0');
  }
  for (const id of ['tooth-base', 'tooth-healthy-pulp', 'tooth-inflam-pulp', 'milktooth-base', 'milktooth-beauty', 'milktooth-healthy-pulp', 'milktooth-inflam-pulp', 'tooth-bruxism-wear', 'tooth-bruxism-neck-wear']) {
    const n = byId(svg, id);
    if (n && !n.hasAttribute('data-active')) n.setAttribute('data-active', '0');
  }
}

const shown = (el: Element, root: Element): boolean => {
  for (let e: Element | null = el; e && e !== root; e = e.parentElement) if (e.getAttribute('data-active') === '0') return false;
  return true;
};

/** Resets and repaints `svg` for `state`. Returns the ids of the active layers. */
export function paintTooth(svg: SVGElement, toothNo: number, state: ToothRecord, opts: PaintOptions): string[] {
  const on = (id: string, v = true): void => setActive(byId(svg, id), v);
  for (const g of ['mods', 'tooth-variants', 'endos', 'surfaces', 'restorations', 'tooth']) {
    const el = byId(svg, g);
    if (el?.hasAttribute('data-active')) el.setAttribute('data-active', '1');
  }
  for (const el of Array.from(svg.querySelectorAll<SVGElement>('[data-proposed]'))) { el.style.strokeDasharray = ''; el.style.stroke = ''; el.removeAttribute('data-proposed'); }
  for (const id of allClearLayers()) {
    const el = byId(svg, id);
    setActive(el, false);
    if (el) { el.style.opacity = ''; el.classList.remove('caries-deep'); }
  }

  const sel = state.toothSelection as string;
  const hasCrown = state.restorationType !== 'none';
  const broken = state.toothSubstrate === 'broken' ? brokenVariant(state) : null;
  const isImplant = sel === 'implant', isMilk = sel === 'milktooth';
  const underGum = isUnderGum(sel);
  const extraction = isExtraction(sel) || (sel === 'none' && !!state.extractionWound);
  const isNone = sel === 'none';
  const hasRemovable = isNone && (state.prosthesis === 'removable-partial' || state.prosthesis === 'removable-full');
  const hasRestoration = hasCrown || hasRemovable;
  const view: 'front' | 'occlusal' = svg.querySelector('[id$="-onlay"]') ? 'occlusal' : 'front';
  const present = isToothPresent(sel);

  const deps = { setActive, svgGetById: byId, isToothPresent, isUnderGum, isExtraction, fissureAllowedTeeth: FISSURE_ALLOWED, brokenVariants: BROKEN_VARIANTS };
  applyFlagLayers(svg, state, buildFlagCtx(state, toothNo, deps), deps);

  if (state.resorptionType !== 'none' && present) on('endo-resorption');
  if (sel === 'tooth-base' && state.restorationType === 'none' && state.toothSubstrate === 'natural') {
    if (state.wearEdge !== 'none') on('tooth-bruxism-wear');
    if (state.wearCervical !== 'none') on('tooth-bruxism-neck-wear');
  }
  if (state.rootCaries !== 'none' && present && view === 'front') {
    const el = byId(svg, 'caries-root');
    setActive(el, true);
    if (el) el.style.opacity = state.rootCaries === 'active' ? '0.5' : state.rootCaries === 'arrested' ? '0.7' : '1';
  }
  if (isImplant && state.periImplant !== 'none') {
    on('parodontal');
    const bone = byId(svg, 'peri-implant-bone-loss');
    const o = state.periImplant === 'peri-implantitis-mild' ? '0.4' : state.periImplant === 'peri-implantitis-moderate' ? '0.7' : state.periImplant === 'peri-implantitis-severe' ? '1' : '';
    setActive(bone, o !== '');
    if (bone && o) bone.style.opacity = o;
  }

  const pulpDiseased = state.pulpDx !== 'normal';
  const pulpMild = state.pulpDx === 'reversible-pulpitis' || state.pulpLatin === 'hyperaemia-pulpae';
  const endoTreated = state.endo !== 'none';
  const flames = (full: boolean): void => {
    for (let n = 1; n <= 8; n++) { on(`pulp-inflam-path-${n}`, full); on(`pulp-inflam-path-${n}1`, full); }
  };

  on('base', opts.showBase);
  on('implant', isImplant);
  on('milktooth', isMilk);
  if (isImplant) on('implant-base');
  else if (isMilk) {
    on('milktooth-base'); on('milktooth-beauty');
    if (pulpDiseased) { if (!endoTreated) { on('milktooth-inflam-pulp'); flames(!pulpMild); } }
    else if (opts.showHealthyPulp) on('milktooth-healthy-pulp');
  } else if (present) {
    if (sel === 'tooth-base') {
      on('tooth-base');
      on('tooth-base-beauty', state.toothSubstrate === 'natural' && state.restorationType === 'none');
    } else on(sel);
    if (!underGum && !extraction) {
      if (pulpDiseased) { if (!endoTreated) { on('tooth-inflam-pulp'); flames(!pulpMild); } }
      else if (opts.showHealthyPulp) on('tooth-healthy-pulp');
    }
  }
  if (broken && sel === 'tooth-base') { on('tooth-base', false); on(broken); }
  if (state.toothSubstrate === 'radix' && sel === 'tooth-base') { on('tooth-base', false); on('tooth-radix'); }
  if (state.toothSubstrate === 'crownprep' && sel === 'tooth-base') { on('tooth-base', false); on('tooth-crownprep'); }
  if (isNone && state.extractionWound) on('no-tooth-after-extraction');

  // Discoloration tints the natural crown; the asset's own fill is captured once and restored otherwise.
  const tintOn = discolorationAllowed(state) && state.discoloration !== 'none';
  const activeCrown = isMilk ? 'milktooth-base' : 'tooth-base';
  for (const id of ['tooth-base', 'milktooth-base']) {
    const el = byId(svg, id);
    if (!el) continue;
    if (el.getAttribute('data-base-fill') === null) el.setAttribute('data-base-fill', el.style.fill || '');
    el.style.fill = tintOn && id === activeCrown ? (TINT[state.discoloration as string] ?? '') : (el.getAttribute('data-base-fill') ?? '');
  }

  const ortho = orthoAllowed(state);
  on('ortho-bracket', ortho && state.orthoAppliance === 'bracket');
  on('ortho-ring', ortho && state.orthoAppliance === 'band');
  on('arrow-mesial', ortho && state.orthoDrift === 'mesial');
  on('arrow-distal', ortho && state.orthoDrift === 'distal');
  on('arrow-up', ortho && state.orthoVertical === 'extrusion');
  on('arrow-down', ortho && state.orthoVertical === 'intrusion');
  on('arrow-rotation', ortho && state.orthoRotation === true);

  // Periapical glyph: apicalDx drives it on a present tooth; mods.inflammation keeps its periodontal role elsewhere.
  const glyphOn = present ? state.apicalDx !== 'normal' : isImplant ? false : state.mods.has('inflammation');
  if (glyphOn) {
    on('inflammation');
    on(state.periapicalType === 'cyst' ? 'cysta'
      : state.periapicalType === 'abscess' || state.apicalDx === 'acute-apical-abscess' || state.apicalDx === 'chronic-apical-abscess' ? 'abscess' : 'granuloma');
  } else if (isImplant) on('inflammation', false);
  if (state.mobility !== 'none' && sel !== 'none' && !extraction && !isImplant) on('mobility');

  if (present && !underGum && !extraction) {
    const e = state.endo as string;
    if (e === 'endo-medical-filling') on('endo-medical-filling');
    else if (e === 'endo-filling') on('endo-filling');
    else if (e === 'endo-glass-pin') { on('endo-filling'); on('endo-glass-pin'); }
    else if (e === 'endo-filling-incomplete') on('endo-filling-incomplete');
    else if (e === 'endo-metal-pin') { on('endo-filling'); on('endo-metal-pin'); }
  }

  if (hasRemovable) { on('prosthesis'); on('prosthesis-crown'); on('prosthesis-connector'); }
  const bar = (): void => { on('implant'); on('implant-bar'); };
  const denture = (): void => { on('prosthesis-implant'); on('prosthesis-implant-crown'); on('prosthesis-implant-gum'); };
  if (isImplant) {
    const p = state.prosthesis as string;
    if (p === 'healing-abutment') on('implant-healing-abutment');
    else if (state.restorationType === 'crown' || state.restorationType === 'bridge') on('implant-connector');
    else if (p === 'locator' || p === 'locator-denture' || p === 'bar' || p === 'bar-denture') {
      on('restorations'); on('implant'); on('implant-connector'); on('implant-locator-screw');
      if (p === 'bar' || p === 'bar-denture') on('implant-bar');
      if (p === 'locator-denture' || p === 'bar-denture') denture();
    }
  }
  if (isNone) {
    on('restorations');
    if (state.prosthesis === 'bar') bar();
    else if (state.prosthesis === 'bar-denture') { bar(); denture(); }
  }
  if (hasCrown && state.restorationMaterial !== 'none') {
    const wrapper = WRAPPER[state.restorationMaterial as string];
    const ids = composeRestorationLayers(state.restorationType as never, state.restorationMaterial as never, view);
    if (wrapper && ids.length) { on('restorations'); on(wrapper); for (const id of ids) on(id); }
  }

  if (!isImplant && !underGum && !extraction && sel !== 'none') {
    for (const id of state.caries as Set<string>) {
      if (id === 'caries-subcrown') { if (hasCrown) on('caries-subcrown'); continue; }
      if (hasRestoration) continue;
      const surface = id.replace('caries-', '');
      const sev: number = state.cariesSeverity.get(surface) ?? 2;
      if (state.fillingSurfaceMaterials.has(surface)) {
        // Recurrent caries (CARS): derived from the filling, never both primary and recurrent.
        const el = byId(svg, `subcaries-${surface}`);
        setActive(el, true);
        if (el && sev > 0) el.style.opacity = String(Math.round((0.3 + ((sev - 1) / 5) * 0.7) * 100) / 100);
      } else {
        const el = byId(svg, id);
        setActive(el, true);
        if (el) {
          const tier = icdasTier(sev);
          el.style.opacity = tier === 3 ? '1' : tier === 2 ? '0.7' : '0.45';
          el.classList.toggle('caries-deep', tier === 3);
        }
      }
    }
    if (state.fillingSurfaceMaterials.size > 0 && !hasCrown) for (const [s, mat] of state.fillingSurfaceMaterials) on(`filling-${mat}-${s}`);
    if (state.fillingDefect?.size > 0 && !hasCrown) {
      for (const [s, v] of state.fillingDefect) if (v && v !== 'none' && state.fillingSurfaceMaterials.has(s)) on(`defect-${s}`);
    }
  }

  // Keep the periapical glyph above resection/resorption artwork.
  const infl = byId(svg, 'inflammation');
  const lift = glyphOn && ((state.endoResection && present && !underGum && !extraction) || (state.resorptionType !== 'none' && present));
  if (infl && lift) {
    const parent = byId(svg, 'tooth')?.parentElement ?? svg;
    if (parent.lastElementChild !== infl) parent.appendChild(infl);
  }
  return Array.from(svg.querySelectorAll('[data-active="1"]')).filter((e) => e.id && shown(e, svg)).map((e) => e.id);
}

export const PROPOSED_DASH = '4 2';
export const PROPOSED_TINT = '#5b7a9d';
/** Plan mode: layers active in the plan but not in status read as proposed (dashed, tinted), never as done work. */
export function markProposed(svg: SVGElement, planIds: readonly string[], statusIds: readonly string[]): void {
  const have = new Set(statusIds);
  for (const id of planIds) {
    if (have.has(id)) continue;
    const el = byId(svg, id);
    if (el) { el.style.strokeDasharray = PROPOSED_DASH; el.style.stroke = PROPOSED_TINT; el.setAttribute('data-proposed', '1'); }
  }
}
