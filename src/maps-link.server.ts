import { MapsLink, isMapsHost, isShortLink, parseMapsLink } from './app/denteus/rules/maps-link';
import { PlaceResult } from './app/denteus/rules/places-rules';

export interface LinkResult extends MapsLink { address?: string; geo?: PlaceResult }

/** Follows a Google link by hand, one hop at a time, and only to Google hosts. Consent pages are unwrapped to the link they continue to. */
export async function followLink(raw: string): Promise<URL | null> {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  for (let hop = 0; hop < 6; hop++) {
    if (!isMapsHost(url.hostname) || url.protocol !== 'https:') return null;
    if (url.hostname === 'consent.google.com') { const next = url.searchParams.get('continue'); if (!next) return null; try { url = new URL(next); } catch { return null; } continue; }
    if (!isShortLink(url) && parseMapsLink(url.href)) return url;
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Dontalist link import)' } });
    const next = res.headers.get('location');
    if (!next) return parseMapsLink(url.href) ? url : null;
    url = new URL(next, url);
  }
  return null;
}

/** Address for a point. Needs a server-side Geocoding key in GOOGLE_MAPS_SERVER_KEY; without one the clinic types its city and country. */
export async function reverseGeocode(lat: number, lng: number, lang: string): Promise<PlaceResult | null> {
  const key = process.env['GOOGLE_MAPS_SERVER_KEY'];
  if (!key) return null;
  const u = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  u.search = new URLSearchParams({ latlng: `${lat},${lng}`, language: lang, key }).toString();
  const body = (await (await fetch(u, { signal: AbortSignal.timeout(5000) })).json()) as { results?: { place_id: string; formatted_address: string; address_components: { long_name: string; short_name: string; types: string[] }[] }[] };
  const r = body.results?.[0];
  return r ? { id: r.place_id, formattedAddress: r.formatted_address, location: { lat, lng }, addressComponents: r.address_components.map((c) => ({ types: c.types, longText: c.long_name, shortText: c.short_name })) } : null;
}

const hits = new Map<string, number[]>();
/** 20 imports a minute per address is plenty for one clinic and keeps the geocoding bill bounded. */
export const rateLimited = (ip: string, now = Date.now()): boolean => {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now); hits.set(ip, recent);
  return recent.length > 20;
};

export async function importLink(raw: string, lang: string): Promise<LinkResult | null> {
  const final = await followLink(raw);
  const parsed = final && parseMapsLink(final.href);
  if (!parsed) return null;
  const geo = parsed.lat !== undefined && parsed.lng !== undefined ? await reverseGeocode(parsed.lat, parsed.lng, lang).catch(() => null) : null;
  return { ...parsed, ...(geo ? { geo, address: geo.formattedAddress } : {}) };
}
