import { newChart } from './engine/chart';
import { editChart } from './engine/plan';
import { graphTeeth } from './perio-graph.component';

describe('graphTeeth', () => {
  it('has no bars when nothing was probed', () => {
    expect(graphTeeth(newChart()).every((t) => [...t.buccal, ...t.lingual].every((b) => b === null))).toBe(true);
  });
  it('maps charted sites and bleeding, leaving unprobed sites empty', () => {
    const o = editChart(newChart(), 'status', [16], { kind: 'perio', site: 'DB', pd: 7 });
    if (o.kind !== 'applied') throw new Error('confirm');
    const o2 = editChart(o.chart, 'status', [16], { kind: 'perio', site: 'DB', bop: true });
    if (o2.kind !== 'applied') throw new Error('confirm');
    const t = graphTeeth(o2.chart).find((x) => x.no === 16)!;
    expect(t.buccal).toEqual([null, null, { site: 'DB', pd: 7, bop: true }]);
    expect(t.lingual).toEqual([null, null, null]);
  });
});
