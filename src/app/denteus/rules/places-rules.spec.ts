import { describe, expect, it } from 'vitest';
import { fromPlace, mapsEmbed, mapsLink } from './places-rules';

const place = { id: 'ChIJabc', formattedAddress: '12 Rue X, Salé, Morocco', location: { lat: 34.05, lng: -6.8 }, addressComponents: [
  { types: ['locality'], longText: 'Salé', shortText: 'Salé' }, { types: ['administrative_area_level_1'], longText: 'Rabat-Salé-Kénitra' }, { types: ['country'], longText: 'Morocco', shortText: 'MA' }] };

describe('fromPlace', () => {
  it('fills geographic fields and keeps only the place id as a Google reference', () => {
    expect(fromPlace(place)).toEqual({ address: '12 Rue X, Salé, Morocco', profile: { placeId: 'ChIJabc', country: 'Morocco', countryCode: 'MA', region: 'Rabat-Salé-Kénitra', city: 'Salé', lat: 34.05, lng: -6.8 } });
  });
  it('copes with a place that has no address parts', () => expect(fromPlace({ id: 'x' })).toEqual({ address: undefined, profile: { placeId: 'x' } }));
  it('falls back from locality to a wider area', () => expect(fromPlace({ id: 'x', addressComponents: [{ types: ['postal_town'], longText: 'Leeds' }] }).profile.city).toBe('Leeds'));
});

describe('map links', () => {
  it('builds a keyless link and needs coordinates', () => {
    expect(mapsLink({ lat: 1, lng: 2, placeId: 'p q' })).toBe('https://www.google.com/maps/search/?api=1&query=1%2C2&query_place_id=p%20q');
    expect(mapsLink({})).toBeUndefined();
  });
  it('never builds an embed without a key', () => {
    expect(mapsEmbed({ lat: 1, lng: 2 }, '')).toBeUndefined();
    expect(mapsEmbed({ lat: 1, lng: 2, placeId: 'p' }, 'K')).toContain('q=place_id%3Ap');
  });
});
