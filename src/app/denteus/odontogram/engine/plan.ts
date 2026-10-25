// Status vs plan. Status = findings; plan = proposed treatment. They are separate teeth maps and never mix:
// a planned restoration is never read from the status chart. Rules from odontogram.ts (ds1 gate).
import { ALL_TEETH, cloneChart, cloneTeeth, type Chart, type TeethMap } from './chart';
import { applyEdit, type ToothEdit } from './edits';
import { defaultState, serializeState } from './vendor/state/payload';

export type ChartMode = 'status' | 'plan';
export interface Rejection { tooth: number; reason: string }
export type EditOutcome =
  | { kind: 'applied'; chart: Chart; changed: number[]; rejected: Rejection[] }
  /** A status edit would make the status diverge from a tooth the clinician deliberately planned. Ask, then retry with `confirmed`. */
  | { kind: 'confirm'; teeth: number[] };

const ser = (m: TeethMap, n: number): string => JSON.stringify(serializeState(m.get(n) ?? defaultState()));
/** Source keeps a runtime-only "plan-edited" set that is lost on reload (and a status edit would then overwrite the
 *  plan). Here it is derived: a tooth is planned iff its plan differs from its status. Flagged deviation, safer. */
export function plannedTeeth(c: Chart): number[] {
  const plan = c.plan;
  return plan ? ALL_TEETH.filter((n) => ser(plan, n) !== ser(c.status, n)) : [];
}

const CLEARS_EDENTULOUS = new Set(['selection', 'substrate', 'restoration']);

export function editChart(chart: Chart, mode: ChartMode, teeth: readonly number[], edit: ToothEdit, opts: { confirmed?: boolean } = {}): EditOutcome {
  const targets = [...new Set(teeth)].filter((n) => ALL_TEETH.includes(n));
  const next = cloneChart(chart);
  const rejected: Rejection[] = [];
  const changed: number[] = [];

  if (mode === 'plan') {
    next.plan ??= cloneTeeth(next.status); // lazy plan: starts as a copy of the findings
    for (const n of targets) {
      const t = next.plan.get(n) ?? defaultState();
      const r = applyEdit(t, n, edit);
      if (!r.ok) rejected.push({ tooth: n, reason: r.reason });
      else { next.plan.set(n, t); if (r.changed) changed.push(n); }
    }
  } else {
    const planned = new Set(plannedTeeth(chart));
    const diverging: number[] = [];
    const results = targets.map((n) => {
      const t = next.status.get(n) ?? defaultState();
      const r = applyEdit(t, n, edit);
      if (r.ok && r.changed && planned.has(n)) diverging.push(n);
      return { n, t, r };
    });
    if (diverging.length && !opts.confirmed) return { kind: 'confirm', teeth: diverging };
    for (const { n, t, r } of results) {
      if (!r.ok) { rejected.push({ tooth: n, reason: r.reason }); continue; }
      next.status.set(n, t);
      if (r.changed) changed.push(n);
      // Un-planned teeth keep tracking status; planned ones diverge on purpose.
      if (next.plan && !planned.has(n)) next.plan.set(n, cloneTeeth(new Map([[n, t]])).get(n) ?? defaultState());
    }
  }
  if (changed.length && CLEARS_EDENTULOUS.has(edit.kind) && !(edit.kind === 'selection' && edit.value === 'none')) next.globals.edentulous = false;
  return { kind: 'applied', chart: changed.length ? next : chart, changed, rejected };
}

/** Whole-mouth edentulous: every tooth to "none" in the active chart, flag set only when something applied. */
export function setEdentulous(chart: Chart, mode: ChartMode, opts: { confirmed?: boolean } = {}): EditOutcome {
  const out = editChart(chart, mode, ALL_TEETH, { kind: 'selection', value: 'none' }, opts);
  if (out.kind === 'applied' && out.changed.length) out.chart.globals.edentulous = true;
  return out;
}

export interface PlanChange { tooth: number; status: unknown; plan: unknown }
/** Teeth whose proposed treatment differs from their findings. Empty when no plan exists. */
export function planChanges(c: Chart): PlanChange[] {
  if (!c.plan) return [];
  return plannedTeeth(c).map((n) => ({ tooth: n, status: serializeState(c.status.get(n) ?? defaultState()), plan: serializeState(c.plan?.get(n) ?? defaultState()) }));
}
