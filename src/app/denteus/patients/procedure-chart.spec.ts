import { newChart } from '../odontogram/engine/chart';
import { editChart } from '../odontogram/engine/plan';
import { PROCEDURE_CHART } from './procedure-chart';

describe('PROCEDURE_CHART', () => {
  it.each(Object.entries(PROCEDURE_CHART))('%s is accepted by the chart engine in findings and in the plan', (_, edit) => {
    for (const mode of ['status', 'plan'] as const) {
      const out = editChart(newChart(), mode, [14], edit, { confirmed: true });
      expect(out.kind).not.toBe('confirm');
      if (out.kind !== 'confirm') { expect(out.rejected).toEqual([]); expect(out.changed).toEqual([14]); }
    }
  });
});
