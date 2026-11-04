import type { Key } from '../../core/i18n/i18n.service';
import { ALL_TEETH } from '../odontogram/engine/chart';
import type { TreatmentItem } from '../models/dental.models';

/** What a procedure is about. Everything but `teeth` yields one record; `teeth` yields one per tooth. */
export type ProcedureScope = 'teeth' | 'quadrant' | 'upper' | 'lower' | 'mouth' | 'none';
export const SCOPES: readonly ProcedureScope[] = ['teeth', 'quadrant', 'upper', 'lower', 'mouth', 'none'];
export const SCOPE_KEY: Record<ProcedureScope, Key> = {
  teeth: 'procedure.scope.teeth', quadrant: 'procedure.scope.quadrant', upper: 'procedure.scope.upper', lower: 'procedure.scope.lower', mouth: 'procedure.scope.mouth', none: 'plan.tooth.none',
};

/** The permanent teeth a scope covers (what the chart highlights); empty for `teeth` and `none`. */
export function teethOfScope(scope: ProcedureScope, quadrant = 1): number[] {
  const q = (n: number) => Math.floor(n / 10);
  if (scope === 'quadrant') return ALL_TEETH.filter((n) => q(n) === quadrant);
  if (scope === 'upper') return ALL_TEETH.filter((n) => q(n) <= 2);
  if (scope === 'lower') return ALL_TEETH.filter((n) => q(n) >= 3);
  return scope === 'mouth' ? [...ALL_TEETH] : [];
}

export interface ProcedureDraft {
  procedure: string; name: string; price: number; done: boolean; date: string;
  scope: ProcedureScope; quadrant: 1 | 2 | 3 | 4; teeth: readonly number[];
}

/** The records to store for a draft. Planned stays planned: only `done` carries `doneAt`. Empty when a tooth scope has no teeth. */
export function buildProcedures(d: ProcedureDraft, newId: () => string): TreatmentItem[] {
  const base = { procedure: d.procedure, name: d.name, price: d.price, status: d.done ? 'done' : 'planned', date: d.date, ...(d.done ? { doneAt: new Date(`${d.date}T12:00:00`).toISOString() } : {}) } as const;
  const make = (extra: Partial<TreatmentItem>): TreatmentItem => ({ id: newId(), ...base, ...extra });
  if (d.scope === 'teeth') return d.teeth.map((n) => make({ tooth: String(n) }));
  if (d.scope === 'quadrant') return [make({ scope: 'quadrant', quadrant: d.quadrant })];
  return [make(d.scope === 'none' ? {} : { scope: d.scope })];
}

/** The text for the tooth column: the tooth number, or what the procedure covers. */
export function scopeText(item: TreatmentItem, t: (k: Key, p?: Record<string, string | number>) => string): string {
  if (item.tooth) return item.tooth;
  if (item.scope === 'quadrant') return t('procedure.quadrant', { n: item.quadrant ?? 1 });
  return item.scope ? t(SCOPE_KEY[item.scope]) : '—';
}
