import { describe, expect, it } from 'vitest';
import { ClinicLocation } from '../models/dental.models';
import { lookup, parseRecords, publicRecord } from './public-record';

const clinic = (over: Partial<ClinicLocation['profile']> = {}): ClinicLocation => ({
  id: 'a', name: 'Dali SARL', legalName: 'Dali SARL', taxId: 'ICE123', bank: 'RIB 999', invoiceNote: 'secret', code: 'M', timezone: 'UTC', active: true, phone: '0600', email: 'a@b.c',
  profile: { state: 'published', displayName: 'Centre Dentaire Dali', country: 'Morocco', countryCode: 'MA', city: 'Salé', slug: 'dali', previousSlugs: ['old-dali'], website: 'javascript:alert(1)', ...over },
});

describe('publicRecord', () => {
  it('never carries private business or invoice data', () => {
    const json = JSON.stringify(publicRecord(clinic(), 'en'));
    for (const secret of ['ICE123', 'RIB 999', 'secret', 'legalName', 'taxId']) expect(json).not.toContain(secret);
    expect(json).toContain('Centre Dentaire Dali');
  });
  it('builds the path and drops unsafe links', () => {
    const r = publicRecord(clinic(), 'en')!;
    expect(r.path).toBe('/clinics/morocco/sale/dali');
    expect(r.previousPaths).toEqual(['/clinics/morocco/sale/old-dali']);
    expect(r.website).toBeUndefined();
  });
  it('needs a slug, country and city', () => expect(publicRecord(clinic({ slug: undefined }), 'en')).toBeNull());
});

describe('lookup', () => {
  const records = [publicRecord(clinic(), 'en')!, publicRecord({ ...clinic({ state: 'draft', slug: 'draft-one', previousSlugs: ['draft-old'] }), id: 'b' }, 'en')!, publicRecord({ ...clinic({ state: 'unpublished', slug: 'gone' }), id: 'c' }, 'en')!];
  it('serves a published clinic', () => expect(lookup(records, 'morocco', 'sale', 'dali').kind).toBe('found'));
  it('redirects an old address to the current one', () => expect(lookup(records, 'morocco', 'sale', 'old-dali')).toEqual({ kind: 'redirect', to: '/clinics/morocco/sale/dali' }));
  it('does not serve drafts, unpublished clinics or their old addresses', () => {
    for (const slug of ['draft-one', 'draft-old', 'gone']) expect(lookup(records, 'morocco', 'sale', slug).kind).toBe('none');
  });
  it('is case-insensitive and rejects other cities', () => {
    expect(lookup(records, 'Morocco', 'Sale', 'Dali').kind).toBe('found');
    expect(lookup(records, 'morocco', 'rabat', 'dali').kind).toBe('none');
  });
});

describe('parseRecords', () => {
  it('skips malformed entries and path-like injection', () => {
    expect(parseRecords([{ path: '/clinics/a/b/../../x', name: 'x' }, { path: '/clinics/a/b/c', name: 'ok' }, null, 5])).toHaveLength(1);
    expect(parseRecords('nope')).toEqual([]);
  });
});
