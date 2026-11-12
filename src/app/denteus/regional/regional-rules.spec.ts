import { COUNTRIES, countryOf, currencyDigits, fold, formatMoney, inCurrency, searchCountries, searchPlaces } from './regional-rules';
import { enabledTypes, payerProblem, suggestedPayers } from './payers';
import { relevantIntegrations } from './integrations';

describe('regional rules', () => {
  it('knows about 250 countries with a currency and a phone prefix', () => {
    expect(COUNTRIES.length).toBe(250);
    expect(countryOf('MA')).toEqual({ code: 'MA', currency: 'MAD', phone: '+212' });
    expect(countryOf('fr')?.currency).toBe('EUR');
    expect(countryOf('US')?.currency).toBe('USD');
    expect(countryOf('AE')?.currency).toBe('AED');
    expect(countryOf('ZZ')).toBeUndefined();
  });
  it('ignores accents, case and punctuation', () => {
    expect(fold('Salé')).toBe('sale');
    expect(fold('  Témara ')).toBe('temara');
    expect(fold("Fès-Meknès")).toBe('fes meknes');
  });
  it('finds places by accent-free or partial text, best match first', () => {
    const cities = ['Casablanca', 'Rabat', 'Fès', 'Salé', 'Témara', 'Sidi Slimane', 'Kenitra'];
    expect(searchPlaces(cities, 'sale')).toEqual(['Salé']);
    expect(searchPlaces(cities, 'temara')).toEqual(['Témara']);
    expect(searchPlaces(cities, 'sl')).toEqual(['Sidi Slimane']);
    expect(searchPlaces(cities, 'ca')).toEqual(['Casablanca']);
    expect(searchPlaces(cities, 'nothing')).toEqual([]);
  });
  it('finds countries by localised name', () => {
    expect(searchCountries('maro', 'fr')[0]?.code).toBe('MA');
    expect(searchCountries('morocco', 'en')[0]?.code).toBe('MA');
    expect(searchCountries('united ar', 'en')[0]?.code).toBe('AE');
  });
  it('formats money with the currency, whole amounts without decimals', () => {
    expect(formatMoney(1500, 'MAD', 'en')).toContain('1,500');
    expect(formatMoney(1500, 'MAD', 'en')).toContain('MAD');
    expect(formatMoney(1500, 'EUR', 'fr')).toMatch(/1\s500\s€/);
    expect(formatMoney(1500, 'USD', 'en')).toBe('$1,500');
    expect(formatMoney(1500.5, 'USD', 'en')).toBe('$1,500.50');
    expect(currencyDigits('JPY')).toBe(0);
  });
  it('leaves other-currency records out of totals and treats unmarked ones as dirhams', () => {
    const rows = [{ id: 1 }, { id: 2, currency: 'MAD' }, { id: 3, currency: 'EUR' }];
    expect(inCurrency(rows, 'MAD').map((r) => r.id)).toEqual([1, 2]);
    expect(inCurrency(rows, 'EUR').map((r) => r.id)).toEqual([3]);
  });
  it('always keeps the patient as a payer and suggests payers per country without duplicating', () => {
    expect(enabledTypes(['public'], 'MA')).toEqual(['patient', 'public']);
    expect(enabledTypes(undefined, 'US')).toEqual(['patient', 'private', 'employer', 'other']);
    const s = suggestedPayers('MA', [{ id: 'x', type: 'public', name: 'cnss' }], () => 'n');
    expect(s.map((p) => p.name)).toEqual(['CNOPS', 'Mutuelle']);
    expect(suggestedPayers('JP', [], () => 'n')).toEqual([]);
  });
  it('validates payer names', () => {
    expect(payerProblem({ id: 'a', type: 'private', name: ' ' }, [])).toBe('name');
    expect(payerProblem({ id: 'b', type: 'private', name: 'AXA' }, [{ id: 'a', type: 'private', name: 'axa' }])).toBe('duplicate');
    expect(payerProblem({ id: 'a', type: 'private', name: 'AXA' }, [{ id: 'a', type: 'private', name: 'axa' }])).toBeNull();
  });
  it('shows only the integrations relevant to the clinic country', () => {
    const ma = relevantIntegrations('MA').map((i) => i.id);
    expect(ma).toContain('ma-cnss');
    expect(ma).not.toContain('us-clearinghouse');
    expect(relevantIntegrations('US').map((i) => i.id)).toContain('us-clearinghouse');
    expect(relevantIntegrations(undefined).every((i) => i.countries === '*')).toBe(true);
  });
});
