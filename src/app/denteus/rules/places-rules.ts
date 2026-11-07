import { ClinicProfile } from '../models/dental.models';

/** The few fields of a Google place this app asks for (the field mask). Nothing else is requested or kept. */
export const PLACE_FIELDS = ['id', 'displayName', 'formattedAddress', 'location', 'addressComponents'] as const;

interface Component { types: string[]; longText?: string; shortText?: string }
export interface PlaceResult { id: string; displayName?: string; formattedAddress?: string; location?: { lat: number; lng: number }; addressComponents?: Component[] }

export interface PlaceFill { address?: string; profile: Partial<ClinicProfile> }

/** Maps a Google place to the clinic's own fields. The clinic reviews these before they are saved; only the place id is kept as a Google reference. */
export function fromPlace(place: PlaceResult): PlaceFill {
  const part = (type: string): Component | undefined => place.addressComponents?.find((c) => c.types.includes(type));
  const city = part('locality') ?? part('postal_town') ?? part('administrative_area_level_2') ?? part('sublocality');
  const country = part('country');
  const profile: Partial<ClinicProfile> = { placeId: place.id };
  if (country?.longText) profile.country = country.longText;
  if (country?.shortText) profile.countryCode = country.shortText.toUpperCase();
  if (part('administrative_area_level_1')?.longText) profile.region = part('administrative_area_level_1')!.longText;
  if (city?.longText) profile.city = city.longText;
  if (place.location && Number.isFinite(place.location.lat) && Number.isFinite(place.location.lng)) { profile.lat = place.location.lat; profile.lng = place.location.lng; }
  return { address: place.formattedAddress, profile };
}

/** Keyless official link that opens the place in Google Maps; used on public pages instead of a paid API call. */
export const mapsLink = (p: Pick<ClinicProfile, 'lat' | 'lng' | 'placeId'>): string | undefined => {
  if (p.lat === undefined || p.lng === undefined) return undefined;
  const base = `https://www.google.com/maps/search/?api=1&query=${p.lat}%2C${p.lng}`;
  return p.placeId ? `${base}&query_place_id=${encodeURIComponent(p.placeId)}` : base;
};

/** Embed API URL. Needs a browser key restricted to the site; returns nothing without one so no request is ever made keyless. */
export const mapsEmbed = (p: Pick<ClinicProfile, 'lat' | 'lng' | 'placeId'>, key: string): string | undefined => {
  if (!key || p.lat === undefined || p.lng === undefined) return undefined;
  const q = p.placeId ? `place_id:${p.placeId}` : `${p.lat},${p.lng}`;
  return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}`;
};

/** Codes Intl still names (East Germany, USSR…) that no current address uses. */
const RETIRED = ['DD', 'SU', 'YU', 'ZR', 'CS', 'NT', 'TP', 'FX', 'BU', 'AN', 'QO', 'EU', 'UN', 'XA', 'XB'];

/** ISO country code from a country name in English or French, using the browser's own country names (no list to maintain). */
export function countryCodeFor(name: string): string | undefined {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return undefined;
  const names = ['en', 'fr'].map((l) => new Intl.DisplayNames([l], { type: 'region' }));
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const a of letters) for (const b of letters) {
    const code = a + b;
    if (RETIRED.includes(code)) continue;
    if (names.some((n) => { try { return n.of(code)?.toLowerCase() === wanted; } catch { return false; } })) return code;
  }
  return undefined;
}
