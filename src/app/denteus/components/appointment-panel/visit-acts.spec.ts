import type { TreatmentItem } from '../../models/dental.models';
import { actsOfVisit, completePlanned, plannedActs, recordVisitAct } from './visit-acts';
import { invoiceState, issueInvoice, uninvoiced } from '../../patients/invoice-rules';
import { planTotals } from '../../patients/treatment-rules';

const now = new Date(2026, 10, 9, 10, 0, 0);
const ids = () => { let n = 0; return () => `n${++n}`; };
const planned: TreatmentItem = { id: 'p1', procedure: 'crown', price: 900, status: 'planned', tooth: '16' };

describe('recording an act from the appointment', () => {
  it('records a routine act with no tooth, as done, linked to the visit', () => {
    const plan = recordVisitAct([], { appointmentId: 'a1', procedure: 'cleaning', name: 'Cleaning', price: 300 }, now, ids())!;
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ procedure: 'cleaning', price: 300, status: 'done', appointmentId: 'a1' });
    expect(plan[0].tooth).toBeUndefined();
    expect(plan[0].scope).toBeUndefined();
    expect(actsOfVisit(plan, 'a1')).toHaveLength(1);
  });
  it('ignores an immediate repeat but allows the same act again later', () => {
    const act = { appointmentId: 'a1', procedure: 'cleaning', name: 'Cleaning', price: 300 };
    const once = recordVisitAct([], act, now, ids())!;
    expect(recordVisitAct(once, act, new Date(now.getTime() + 1000), ids())).toBeNull();
    expect(recordVisitAct(once, act, new Date(now.getTime() + 10_000), ids())).toHaveLength(2);
  });
  it('keeps planned treatment separate until it is completed, and never completes it twice', () => {
    const plan = recordVisitAct([planned], { appointmentId: 'a1', procedure: 'cleaning', name: 'Cleaning', price: 300 }, now, ids())!;
    expect(plannedActs(plan).map((i) => i.id)).toEqual(['p1']);
    expect(planTotals(plan)).toMatchObject({ planned: 900, done: 300 });
    const done = completePlanned(plan, 'p1', 'a1', now)!;
    expect(done.filter((i) => i.procedure === 'crown')).toHaveLength(1);
    expect(plannedActs(done)).toHaveLength(0);
    expect(completePlanned(done, 'p1', 'a1', now)).toBeNull();
    expect(completePlanned(done, 'missing', 'a1', now)).toBeNull();
  });
  it('does not bill or pay anything by itself, and flows into the existing invoice rules', () => {
    const plan = recordVisitAct([], { appointmentId: 'a1', procedure: 'cleaning', name: 'Cleaning', price: 300 }, now, ids())!;
    const billable = uninvoiced(plan, []);
    expect(billable).toHaveLength(1);
    const invoice = issueInvoice(billable, (i) => ({ itemId: i.id, label: i.procedure, price: i.price }), [], now)!;
    expect(uninvoiced(plan, [invoice])).toHaveLength(0); // no second invoice for the same act
    expect(invoiceState(invoice, []).state).toBe('unpaid');
  });
});
