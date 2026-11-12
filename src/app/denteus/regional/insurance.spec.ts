import type { InsuranceProvider } from './insurance';
import { customProblem, insuranceProblem, parseCatalog, searchProviders, tidyInsurance } from './insurance';

let ma: InsuranceProvider[] = [];
beforeAll(async () => { const fs: { readFileSync(p: string, e: string): string } = await import(/* @vite-ignore */ 'node:' + 'fs'); ma = parseCatalog(JSON.parse(fs.readFileSync('public/insurance/MA.json', 'utf8'))); });

describe('insurance reference data', () => {
  it('ships a Moroccan catalogue with public, military, mutual and private organisations and unique ids', () => {
    expect(new Set(ma.map((p) => p.kind))).toEqual(new Set(['public', 'military', 'mutual', 'private']));
    expect(new Set(ma.map((p) => p.id)).size).toBe(ma.length);
    expect(ma.map((p) => p.short)).toEqual(expect.arrayContaining(['CNSS', 'CNOPS', 'FAR']));
  });
  it('finds providers by acronym, alias or accent-free name', () => {
    expect(searchProviders(ma, 'cnss')[0].id).toBe('ma-cnss');
    expect(searchProviders(ma, 'ramed')[0].id).toBe('ma-amo-tadamon');
    expect(searchProviders(ma, 'education')[0].short).toBe('MGEN');
    expect(searchProviders(ma, 'zzzz')).toEqual([]);
  });
  it('drops malformed entries and unknown fields when reading a file', () => {
    expect(parseCatalog({ entries: [{ id: 'a', name: 'A', kind: 'weird', evil: 1 }, { name: 'no id' }, 5] })).toEqual([{ id: 'a', name: 'A', kind: 'other' }]);
    expect(parseCatalog('x')).toEqual([]);
  });
  it('refuses empty or duplicate custom providers', () => {
    expect(customProblem('  ', ma)).toBe('name');
    expect(customProblem('cnss', ma)).toBe('duplicate');
    expect(customProblem('Mutuelle du Cabinet X', ma)).toBeNull();
  });
  it('needs a provider and a number, and trims what it keeps', () => {
    expect(insuranceProblem({ providerId: '', number: '1' })).toBe('provider');
    expect(insuranceProblem({ providerId: 'x', number: ' ' })).toBe('number');
    expect(tidyInsurance({ id: '1', providerId: 'x', providerName: ' CNSS ', number: ' 123 ', policy: ' ', addedAt: 't' })).toEqual({ id: '1', providerId: 'x', providerName: 'CNSS', number: '123', addedAt: 't' });
  });
});
