import { TestBed } from '@angular/core/testing';
import { newChart } from './engine/chart';
import { ToothSnap } from './tooth-snap.service';

describe('ToothSnap without WebGL', () => {
  it('resolves to null (the chart then falls back to the flat drawing) instead of throwing', async () => {
    const snap = TestBed.inject(ToothSnap);
    const tooth = newChart().status.get(16)!;
    await expect(snap.snap(16, tooth, false)).resolves.toBeNull();
    await expect(snap.snap(16, tooth, false, true)).resolves.toBeNull();
  });
});
