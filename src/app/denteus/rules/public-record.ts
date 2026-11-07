import { ClinicLocation } from '../models/dental.models';
import { clinicPath, displayName, safeUrl } from './clinic-profile-rules';

/**
 * What a public page may show. Built from the clinic's profile only: the legal name, tax number, bank details,
 * patients and every other private field never enter this record.
 */
export interface PublicClinic {
  id: string;
  path: string;
  previousPaths: string[];
  state: 'published' | 'closed' | 'draft' | 'unpublished';
  lang: 'en' | 'fr';
  name: string;
  intro?: string;
  description?: string;
  address?: string;
  phone?: string;
  email?: string;
  whatsapp?: string;
  website?: string;
  instagram?: string;
  facebook?: string;
  country: string;
  countryCode?: string;
  region?: string;
  city: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  languages: string[];
  services: string[];
  specialties: string[];
  hours?: ClinicLocation['hours'];
  closures: { from: string; to: string; reason?: string }[];
  /** Data URLs for now; the server serves them as image files. */
  cover?: string;
  gallery: string[];
}

export function publicRecord(c: ClinicLocation, lang: 'en' | 'fr'): PublicClinic | null {
  const p = c.profile;
  if (!p?.slug || !p.country || !p.city) return null;
  return {
    id: c.id, path: clinicPath(p.country, p.city, p.slug), state: p.state, lang, name: displayName(c),
    previousPaths: (p.previousSlugs ?? []).map((s) => clinicPath(p.country!, p.city!, s)),
    intro: p.intro, description: p.description, address: c.address, phone: c.phone, email: c.email, whatsapp: p.whatsapp,
    website: safeUrl(p.website), instagram: safeUrl(p.instagram), facebook: safeUrl(p.facebook),
    country: p.country, countryCode: p.countryCode, region: p.region, city: p.city, lat: p.lat, lng: p.lng, placeId: p.placeId,
    languages: p.languages ?? [], services: p.services ?? [], specialties: p.specialties ?? [], hours: c.hours, closures: p.closures ?? [],
    cover: p.cover, gallery: p.gallery ?? [],
  };
}

export type PublicLookup = { kind: 'found'; clinic: PublicClinic } | { kind: 'redirect'; to: string } | { kind: 'none' };
export const isLive = (r: PublicClinic): boolean => r.state === 'published' || r.state === 'closed';

/** Finds the clinic at a path. Only live clinics are served; an old address redirects to the current one. */
export function lookup(records: readonly PublicClinic[], country: string, city: string, slug: string): PublicLookup {
  const path = `/clinics/${country}/${city}/${slug}`.toLowerCase();
  const live = records.filter(isLive);
  const here = live.find((r) => r.path === path);
  if (here) return { kind: 'found', clinic: here };
  const moved = live.find((r) => r.previousPaths.includes(path) && r.path !== path);
  return moved ? { kind: 'redirect', to: moved.path } : { kind: 'none' };
}

/** Parses the file the owner exports; anything malformed is skipped rather than served. */
export function parseRecords(raw: unknown): PublicClinic[] {
  const list = Array.isArray(raw) ? raw : [];
  return list.filter((r): r is PublicClinic => !!r && typeof r === 'object' && typeof (r as PublicClinic).path === 'string' && /^\/clinics\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+$/.test((r as PublicClinic).path) && typeof (r as PublicClinic).name === 'string');
}
