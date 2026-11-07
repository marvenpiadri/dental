import { describe, expect, it } from 'vitest';
import { ClinicLocation, ClinicProfile } from '../models/dental.models';
import { changeSlug, checkPath, clinicPath, freeSlug, jsonLd, publishProblems, safeUrl, seoDescription, slugProblem, slugify } from './clinic-profile-rules';

const base = (profile: Partial<ClinicProfile> = {}): ClinicLocation => ({ id: 'a', name: 'Centre Dentaire Dali', code: 'M', timezone: 'UTC', active: true, profile: { state: 'draft', ...profile } });

describe('slugify', () => {
  it('removes accents and special letters', () => {
    expect(slugify('Centre Dentaire Dalí – Salé')).toBe('centre-dentaire-dali-sale');
    expect(slugify('Straße Œuvre Ørsted')).toBe('strasse-oeuvre-orsted');
  });
  it('gives an empty slug for scripts with no Latin form', () => expect(slugify('عيادة')).toBe(''));
});

describe('slugProblem', () => {
  it('rejects empty, malformed, reserved and short slugs', () => {
    expect(slugProblem('')).toBe('empty');
    expect(slugProblem('Bad Slug')).toBe('format');
    expect(slugProblem('-x-')).toBe('format');
    expect(slugProblem('admin')).toBe('reserved');
    expect(slugProblem('ab')).toBe('short');
    expect(slugProblem('dali-2')).toBeNull();
  });
});

describe('collisions', () => {
  const taken = [{ id: 'b', path: '/clinics/morocco/sale/dali', previousPaths: ['/clinics/morocco/sale/old-dali'] }];
  it('validates the whole path, not the name', () => {
    expect(checkPath('/clinics/morocco/sale/dali', 'a', taken)).toBe('taken');
    expect(checkPath('/clinics/morocco/rabat/dali', 'a', taken)).toBe('ok');
    expect(checkPath('/clinics/morocco/sale/old-dali', 'a', taken)).toBe('redirects');
    expect(checkPath('/clinics/morocco/sale/dali', 'b', taken)).toBe('ok');
  });
  it('gives the same suffix every time and never an existing path', () => {
    expect(freeSlug('Dali', 'Morocco', 'Salé', 'a', taken)).toBe('dali-2');
    expect(freeSlug('Dali', 'Morocco', 'Salé', 'a', taken)).toBe('dali-2');
    expect(freeSlug('Dali', 'Morocco', 'Rabat', 'a', taken)).toBe('dali');
    expect(freeSlug('Admin', 'Morocco', 'Rabat', 'a', [])).toBe('admin-clinic');
    expect(freeSlug('عيادة', 'Morocco', 'Rabat', 'a', [])).toBe('clinic');
  });
  it('builds the path from the geographic segments', () => expect(clinicPath('Maroc', 'Salé', 'dali')).toBe('/clinics/maroc/sale/dali'));
});

describe('changeSlug', () => {
  it('keeps a published slug as a redirect and never lets it loop', () => {
    const live = { state: 'published' as const, slug: 'dali' };
    const moved = changeSlug(live, 'dali-centre');
    expect(moved.previousSlugs).toEqual(['dali']);
    const back = changeSlug(moved, 'dali');
    expect(back.slug).toBe('dali');
    expect(back.previousSlugs).toEqual(['dali-centre']);
  });
  it('does not keep drafts as redirects', () => expect(changeSlug({ state: 'draft', slug: 'x1x' }, 'y2y').previousSlugs).toEqual([]));
});

describe('publishing', () => {
  it('lists what is missing', () => {
    expect(publishProblems('Dali', { state: 'draft' })).toEqual(['country', 'city', 'slug', 'location', 'contact']);
    expect(publishProblems('Dali', { state: 'draft', country: 'Morocco', countryCode: 'MA', city: 'Salé', slug: 'dali', lat: 1, lng: 2, whatsapp: '+212' })).toEqual([]);
  });
});

describe('seo', () => {
  it('uses only what the clinic entered', () => {
    expect(seoDescription(base({ city: 'Salé', country: 'Morocco' }), 'en')).toBe('Centre Dentaire Dali, dental clinic in Salé, Morocco.');
    expect(seoDescription(base({ city: 'Salé', country: 'Morocco', services: ['Implants'] }), 'fr')).toContain('Soins : Implants.');
    expect(seoDescription(base({ intro: 'Hello' }), 'en')).toBe('Hello');
  });
  it('leaves unknown fields out of the structured data', () => {
    const ld = jsonLd(base({ city: 'Salé', countryCode: 'MA' }), '/clinics/morocco/sale/dali');
    expect(ld['@type']).toBe('Dentist');
    expect(ld).not.toHaveProperty('geo');
    expect(ld).not.toHaveProperty('telephone');
    expect(ld['address']).toEqual({ '@type': 'PostalAddress', addressLocality: 'Salé', addressCountry: 'MA' });
  });
  it('drops links that are not http(s)', () => {
    expect(safeUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeUrl('https://x.com/a')).toBe('https://x.com/a');
  });
});
