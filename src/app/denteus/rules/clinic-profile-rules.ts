import { ClinicLocation, ClinicProfile } from '../models/dental.models';

/** Segments that would collide with routes or look official. Checked for the clinic segment only. */
export const RESERVED_SLUGS: readonly string[] = ['admin', 'api', 'app', 'new', 'edit', 'search', 'sitemap', 'robots', 'login', 'sign-in', 'settings', 'setup', 'today', 'calendar', 'patients', 'dontalist', 'null', 'undefined'];

const SPECIAL: Record<string, string> = { ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', đ: 'd', ł: 'l', ı: 'i', þ: 'th', ð: 'd' };

/** URL-safe lowercase text: accents and special letters become plain letters. Scripts without a Latin form (Arabic, Chinese) give '' and the caller falls back. */
export function slugify(text: string, max = 60): string {
  const plain = text.toLowerCase().replace(/[ßæœøđłıþð]/g, (c) => SPECIAL[c] ?? c).normalize('NFKD').replace(/\p{M}/gu, '');
  return plain.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/g, '');
}

export type SlugProblem = 'empty' | 'format' | 'reserved' | 'short';
export function slugProblem(slug: string | undefined): SlugProblem | null {
  if (!slug) return 'empty';
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60) return 'format';
  if (slug.length < 3) return 'short';
  if (RESERVED_SLUGS.includes(slug)) return 'reserved';
  return null;
}

export const clinicPath = (country: string, city: string, slug: string): string => `/clinics/${slugify(country)}/${slugify(city)}/${slug}`;

/** A clinic as the shared registry knows it. The registry is the backend's job; the frontend can only see what it is given. */
export interface RegistryEntry { id: string; path: string; previousPaths: string[] }

export type PathCheck = 'ok' | 'taken' | 'redirects';
/** `taken`: another clinic publishes there now. `redirects`: another clinic used to, and its old URL redirects here. */
export function checkPath(path: string, ownerId: string, registry: readonly RegistryEntry[]): PathCheck {
  const others = registry.filter((r) => r.id !== ownerId);
  if (others.some((r) => r.path === path)) return 'taken';
  return others.some((r) => r.previousPaths.includes(path)) ? 'redirects' : 'ok';
}

/** First free path for a base slug: `name`, `name-2`, `name-3`. Same input and registry always give the same answer. */
export function freeSlug(base: string, country: string, city: string, ownerId: string, registry: readonly RegistryEntry[]): string {
  const root = slugify(base) || 'clinic';
  const start = slugProblem(root) ? `${root}-clinic` : root;
  for (let n = 1; n < 1000; n++) {
    const candidate = n === 1 ? start : `${start}-${n}`;
    if (!slugProblem(candidate) && checkPath(clinicPath(country, city, candidate), ownerId, registry) === 'ok') return candidate;
  }
  return `${start}-${ownerId.slice(0, 6)}`;
}

/** Changing a published slug keeps the old one as a redirect. Going back to an old slug drops it from the list, so redirects can never loop. */
export function changeSlug(profile: ClinicProfile, next: string): ClinicProfile {
  if (next === profile.slug) return profile;
  const previous = new Set(profile.previousSlugs ?? []);
  if (profile.slug && profile.state !== 'draft') previous.add(profile.slug);
  previous.delete(next);
  return { ...profile, slug: next, previousSlugs: [...previous] };
}

export type PublishProblem = 'name' | 'country' | 'city' | 'slug' | 'contact' | 'location';
export function publishProblems(name: string | undefined, p: ClinicProfile): PublishProblem[] {
  const out: PublishProblem[] = [];
  if (!(p.displayName?.trim() || name?.trim())) out.push('name');
  if (!p.country?.trim() || !p.countryCode?.trim()) out.push('country');
  if (!p.city?.trim()) out.push('city');
  if (slugProblem(p.slug)) out.push('slug');
  if (!(p.lat !== undefined && p.lng !== undefined) && !p.placeId) out.push('location');
  if (!(p.whatsapp?.trim() || p.website?.trim())) out.push('contact');
  return out;
}

export const displayName = (c: ClinicLocation): string => c.profile?.displayName?.trim() || c.name;

/** Only what the clinic actually entered goes into the description; nothing is invented. */
export function seoDescription(c: ClinicLocation, lang: 'en' | 'fr'): string {
  const p = c.profile;
  const where = [p?.city, p?.country].filter(Boolean).join(', ');
  const services = (p?.services ?? []).slice(0, 4).join(', ');
  if (p?.intro?.trim()) return p.intro.trim().slice(0, 155);
  const head = lang === 'fr' ? `${displayName(c)}, cabinet dentaire à ${where}.` : `${displayName(c)}, dental clinic in ${where}.`;
  const tail = services ? (lang === 'fr' ? ` Soins : ${services}.` : ` Services: ${services}.`) : '';
  return (head + tail).slice(0, 155);
}

export const seoTitle = (c: ClinicLocation, lang: 'en' | 'fr'): string =>
  `${displayName(c)} · ${lang === 'fr' ? 'Cabinet dentaire' : 'Dental clinic'}${c.profile?.city ? (lang === 'fr' ? ` à ${c.profile.city}` : ` in ${c.profile.city}`) : ''}`;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** schema.org Dentist. Fields the clinic did not fill in are left out rather than guessed. */
export function jsonLd(c: ClinicLocation, url: string, image?: string): Record<string, unknown> {
  const p = c.profile ?? ({ state: 'draft' } as ClinicProfile);
  const data: Record<string, unknown> = { '@context': 'https://schema.org', '@type': 'Dentist', name: displayName(c), url };
  if (p.intro || p.description) data['description'] = (p.intro || p.description)!.trim();
  if (c.phone) data['telephone'] = c.phone;
  if (c.email) data['email'] = c.email;
  if (c.address || p.city || p.countryCode) data['address'] = Object.fromEntries(Object.entries({ '@type': 'PostalAddress', streetAddress: c.address, addressLocality: p.city, addressRegion: p.region, addressCountry: p.countryCode }).filter(([, v]) => v));
  if (p.lat !== undefined && p.lng !== undefined) data['geo'] = { '@type': 'GeoCoordinates', latitude: p.lat, longitude: p.lng };
  if (c.hours?.days?.length) data['openingHoursSpecification'] = [{ '@type': 'OpeningHoursSpecification', dayOfWeek: c.hours.days.map((d) => DAY_NAMES[d]), opens: c.hours.open, closes: c.hours.close }];
  const same = [p.website, p.instagram, p.facebook].filter((x): x is string => !!x);
  if (same.length) data['sameAs'] = same;
  if (image) data['image'] = image;
  if (p.languages?.length) data['knowsLanguage'] = p.languages;
  return data;
}

/** Only absolute http(s) links are published; anything else (javascript:, data:) is dropped. */
export const safeUrl = (raw: string | undefined): string | undefined => {
  try { const u = new URL(raw ?? ''); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : undefined; } catch { return undefined; }
};
