import type { Key } from '../../core/i18n/i18n.service';
import { CatalogEntry, PROCEDURES, Payment, ProcedureId, TreatmentItem } from '../models/dental.models';

/** Prices (MAD) of the built-in acts in a new clinic. After that the clinic edits its own catalog. */
export const DEFAULT_PRICE: Record<ProcedureId, number> = {
  filling: 400, cleaning: 300, extraction: 400, 'root-canal': 1200, crown: 2500, implant: 8000, xray: 100, other: 0,
};

export const PROCEDURE_KEY: Record<ProcedureId, Key> = {
  filling: 'proc.filling', cleaning: 'proc.cleaning', extraction: 'proc.extraction', 'root-canal': 'proc.rootCanal',
  crown: 'proc.crown', implant: 'proc.implant', xray: 'proc.xray', other: 'proc.other',
};

export const defaultCatalog = (): CatalogEntry[] => PROCEDURES.map((id) => ({ id, price: DEFAULT_PRICE[id] }));

/** What to show for an act: its own name, else the translation of a built-in, else the raw id. */
export function procedureName(t: (key: Key) => string, id: string, name?: string): string {
  if (name) return name;
  const key = (PROCEDURE_KEY as Record<string, Key | undefined>)[id];
  return key ? t(key) : id;
}

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

export interface Balance { charged: number; paid: number; due: number }

/** Done work is what the patient is charged for; planned work is not billed yet. `due` is negative when they have paid ahead. */
export function balance(plan: readonly TreatmentItem[], payments: readonly Payment[]): Balance {
  const charged = planTotals(plan).done;
  const paid = payments.reduce((n, p) => n + p.amount, 0);
  return { charged, paid, due: charged - paid };
}

/**
 * What each done act has received. Payments are not tied to acts, so they are applied oldest act first.
 * shortcut: first-in first-out allocation, upgrade to per-act payments if the clinic needs to settle acts out of order.
 */
export function allocate(plan: readonly TreatmentItem[], payments: readonly Payment[]): Map<string, { received: number; remaining: number }> {
  let pool = payments.reduce((n, p) => n + p.amount, 0);
  const out = new Map<string, { received: number; remaining: number }>();
  const when = (i: TreatmentItem) => i.date ?? i.doneAt?.slice(0, 10) ?? '';
  for (const item of plan.filter((i) => i.status === 'done').sort((a, b) => when(a).localeCompare(when(b)))) {
    const received = Math.max(0, Math.min(pool, item.price));
    pool -= received;
    out.set(item.id, { received, remaining: item.price - received });
  }
  return out;
}
