import type { TreatmentItem } from '../../models/dental.models';
import { buildProcedures } from '../../patients/procedure-record';

/** Acts recorded or completed from this appointment, as they stand in the patient's plan. */
export const actsOfVisit = (plan: readonly TreatmentItem[], appointmentId: string): TreatmentItem[] =>
  plan.filter((i) => i.status === 'done' && i.appointmentId === appointmentId);

/** Treatments the patient still has planned: finishing one of these is how a planned act is performed, not a second record. */
export const plannedActs = (plan: readonly TreatmentItem[]): TreatmentItem[] => plan.filter((i) => i.status === 'planned');

const REPEAT_MS = 3000;

/**
 * Records a routine act as performed, with no tooth. Returns the new plan, or null when the same act was just recorded
 * for this visit (a double click must not bill twice).
 */
export function recordVisitAct(
  plan: readonly TreatmentItem[],
  act: { appointmentId: string; procedure: string; name: string; price: number },
  now: Date,
  newId: () => string = () => crypto.randomUUID(),
): TreatmentItem[] | null {
  const again = plan.some((i) => i.appointmentId === act.appointmentId && i.procedure === act.procedure && !i.tooth && !i.scope && i.status === 'done' && now.getTime() - new Date(i.doneAt ?? 0).getTime() < REPEAT_MS);
  if (again) return null;
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const made = buildProcedures({ procedure: act.procedure, name: act.name, price: act.price, done: true, date: day, scope: 'none', quadrant: 1, teeth: [] }, newId)
    .map((i) => ({ ...i, doneAt: now.toISOString(), appointmentId: act.appointmentId }));
  return [...plan, ...made];
}

/** Marks one planned treatment as performed at this visit. Null when it is not (or no longer) planned. */
export function completePlanned(plan: readonly TreatmentItem[], itemId: string, appointmentId: string, now: Date): TreatmentItem[] | null {
  if (!plan.some((i) => i.id === itemId && i.status === 'planned')) return null;
  return plan.map((i) => (i.id === itemId ? { ...i, status: 'done', doneAt: now.toISOString(), appointmentId } : i));
}
