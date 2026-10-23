import { PROCEDURES, ProcedureId, TreatmentItem } from '../models/dental.models';

/** Starting prices (MAD) offered when a procedure is picked; the dentist can overwrite them per item. */
// shortcut: one price list for the whole clinic, in code. Move to clinic setup when prices need editing.
export const DEFAULT_PRICE: Record<ProcedureId, number> = {
  filling: 400, cleaning: 300, extraction: 400, 'root-canal': 1200, crown: 2500, implant: 8000, xray: 100, other: 0,
};

export { PROCEDURES };

export interface PlanTotals { planned: number; done: number; total: number }

export function planTotals(plan: readonly TreatmentItem[]): PlanTotals {
  const sum = (status: TreatmentItem['status']) => plan.filter((i) => i.status === status).reduce((n, i) => n + i.price, 0);
  const planned = sum('planned');
  const done = sum('done');
  return { planned, done, total: planned + done };
}

/** Whole, non-negative amount from what was typed; null when it isn't one. Accepts "1 200" and "1200,50". */
export function parsePrice(text: string): number | null {
  const cleaned = text.replace(/[\s ]/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned));
}
