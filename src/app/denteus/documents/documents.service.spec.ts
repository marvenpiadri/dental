import { TestBed } from '@angular/core/testing';
import { ClinicDatabase } from '../services/clinic-database.service';
import { Documents } from './documents.service';
import { DEFAULT_TEMPLATE, PRESETS } from './doc-engine';

describe('Documents', () => {
  const saved: Record<string, unknown> = {};
  const setup = () => {
    TestBed.configureTestingModule({ providers: [{ provide: ClinicDatabase, useValue: { loadSetting: async (k: string) => saved[k], saveSetting: async (k: string, v: unknown) => { saved[k] = v; } } }] });
    return TestBed.inject(Documents);
  };

  it('prints with the default template until a template is chosen for a kind', () => {
    expect(setup().templateFor('invoice').id).toBe(DEFAULT_TEMPLATE.id);
  });

  it('keeps a saved template and the choice of default per kind', async () => {
    const docs = setup();
    await new Promise((r) => setTimeout(r)); // let the first load finish
    await docs.save({ ...PRESETS[0], id: 'mine', name: 'Mine', builtin: undefined, chartKinds: ['report'] });
    await docs.setDefault('invoice', 'mine');
    expect(docs.templateFor('invoice').name).toBe('Mine');
    expect(docs.templateFor('quote').id).toBe(DEFAULT_TEMPLATE.id);
    expect((saved['docDefaults'] as Record<string, string>)['invoice']).toBe('mine');
  });

  it('adds the chart only where the template asks for it, and empty for a patient with nothing recorded', () => {
    const docs = setup(), tpl = { ...PRESETS[0], chartKinds: ['report' as const] };
    expect(docs.chartFor('invoice', tpl, undefined)).toBeUndefined();
    const svg = docs.chartFor('report', tpl, undefined)!;
    expect(svg).toContain('<svg');
    expect(svg).toContain('>11</text>');
  });
});
