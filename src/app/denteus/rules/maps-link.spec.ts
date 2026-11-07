import { describe, expect, it } from 'vitest';
import { isMapsHost, isShortLink, parseMapsLink } from './maps-link';

describe('parseMapsLink', () => {
  it('reads the pin, not the map centre', () => {
    const r = parseMapsLink('https://www.google.com/maps/place/Centre+Dentaire+Dali/@34.0600,-6.8000,17z/data=!3m1!4b1!4m6!3m5!1s0xabc:0xdef!8m2!3d34.0531!4d-6.7985!16s');
    expect(r).toEqual({ lat: 34.0531, lng: -6.7985, name: 'Centre Dentaire Dali' });
  });
  it('falls back to the map centre and to query parameters', () => {
    expect(parseMapsLink('https://www.google.com/maps/@34.05,-6.79,15z')).toEqual({ lat: 34.05, lng: -6.79 });
    expect(parseMapsLink('https://www.google.com/maps/search/?api=1&query=34.05%2C-6.79&query_place_id=ChIJabc')).toEqual({ lat: 34.05, lng: -6.79, placeId: 'ChIJabc' });
    expect(parseMapsLink('https://maps.google.com/?q=48.85,2.35')).toEqual({ lat: 48.85, lng: 2.35 });
  });
  it('handles negative and accented values', () => expect(parseMapsLink('https://www.google.com/maps/place/Caf%C3%A9+Z%C3%A9/@-33.9,18.4,17z')).toEqual({ lat: -33.9, lng: 18.4, name: 'Café Zé' }));
  it('rejects other sites, other schemes and out-of-range numbers', () => {
    expect(parseMapsLink('https://evil.com/maps/@34,-6,17z')).toBeNull();
    expect(parseMapsLink('javascript:alert(1)')).toBeNull();
    expect(parseMapsLink('https://www.google.com/maps/@95,-6,17z')).toBeNull();
    expect(parseMapsLink('not a link')).toBeNull();
  });
  it('gives nothing for a short link until it is followed', () => expect(parseMapsLink('https://maps.app.goo.gl/AbCd123')).toBeNull());
});

describe('hosts', () => {
  it('allows only Google hosts', () => {
    for (const h of ['www.google.com', 'google.fr', 'maps.google.com', 'maps.app.goo.gl', 'goo.gl']) expect(isMapsHost(h)).toBe(true);
    for (const h of ['evil.com', 'google.com.evil.com', 'goo.gl.evil.com', 'localhost', '127.0.0.1']) expect(isMapsHost(h)).toBe(false);
  });
  it('knows which links must be followed', () => {
    expect(isShortLink(new URL('https://maps.app.goo.gl/x'))).toBe(true);
    expect(isShortLink(new URL('https://www.google.com/maps/@1,2,3z'))).toBe(false);
  });
});
