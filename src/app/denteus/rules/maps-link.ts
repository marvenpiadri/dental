/** What a Google Maps link gives us without calling any API: coordinates, the place name and sometimes the place id. */
export interface MapsLink { lat?: number; lng?: number; name?: string; placeId?: string }

/** Only Google's own hosts are ever opened or followed (stops the link import being used to reach other servers). */
const HOSTS = /^(www\.|maps\.)?google\.[a-z.]{2,6}$|^maps\.app\.goo\.gl$|^goo\.gl$|^g\.page$|^consent\.google\.com$/;
export const isMapsHost = (host: string): boolean => HOSTS.test(host.toLowerCase());

/** Short links (maps.app.goo.gl/…) carry nothing until they are followed. */
export const isShortLink = (u: URL): boolean => /^(maps\.app\.goo\.gl|goo\.gl|g\.page)$/.test(u.hostname.toLowerCase());

const num = (s: string | undefined | null): number | undefined => {
  const n = Number(s);
  return s && Number.isFinite(n) ? n : undefined;
};
const valid = (lat?: number, lng?: number): boolean => lat !== undefined && lng !== undefined && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

export function parseMapsLink(raw: string): MapsLink | null {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !isMapsHost(url.hostname)) return null;
  const out: MapsLink = {};
  const text = decodeURIComponent(url.pathname + url.search + (url.hash ?? '')).replace(/\+/g, ' ');
  // The pin's own coordinates (!3d…!4d…) beat the map centre (@lat,lng), which is only where the view was left.
  const pin = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(text);
  const centre = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(text);
  const query = /[?&](?:q|query|ll|destination)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/.exec(decodeURIComponent(url.search));
  const m = pin ?? query ?? centre;
  if (m && valid(num(m[1]), num(m[2]))) { out.lat = num(m[1]); out.lng = num(m[2]); }
  const place = /\/maps\/place\/([^/@]+)/.exec(decodeURIComponent(url.pathname));
  if (place) out.name = place[1].replace(/\+/g, ' ').trim() || undefined;
  const id = url.searchParams.get('query_place_id') ?? url.searchParams.get('place_id') ?? /[?&]q=place_id:([\w-]+)/.exec(url.search)?.[1];
  if (id) out.placeId = id;
  return out.lat !== undefined || out.placeId || out.name ? out : null;
}
