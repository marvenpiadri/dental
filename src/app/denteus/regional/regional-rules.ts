import { COUNTRY_ROWS } from './countries';

/** What the app knows about a country without loading any city data. */
export interface Country { code: string; currency: string; phone: string }

export const COUNTRIES: readonly Country[] = COUNTRY_ROWS.split(';').map((row) => { const [code, currency, phone] = row.split('|'); return { code, currency, phone }; });
const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));
export const countryOf = (code: string | undefined): Country | undefined => (code ? BY_CODE.get(code.toUpperCase()) : undefined);

/** Lower case, accents and punctuation removed, so "Salé", "sale" and "SALE" match. */
export const fold = (text: string): string =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/gi, 'oe').replace(/æ/gi, 'ae').replace(/ß/g, 'ss').replace(/ø/gi, 'o').replace(/đ/gi, 'd').replace(/ł/gi, 'l').replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

/** The country's name in the interface language, from the browser's own data (nothing is bundled). */
export function countryName(code: string, lang: string): string {
  try { return new Intl.DisplayNames([lang], { type: 'region' }).of(code.toUpperCase()) ?? code; } catch { return code; }
}

/** Countries whose localised name, code or phone prefix matches the text, best matches first. */
export function searchCountries(query: string, lang: string, limit = 8): Country[] {
  const q = fold(query);
  if (!q) return COUNTRIES.slice().sort((a, b) => countryName(a.code, lang).localeCompare(countryName(b.code, lang), lang)).slice(0, limit);
  const scored: [number, Country][] = [];
  for (const c of COUNTRIES) {
    // the English name matches too, so "Morocco" finds it from a French screen and "Maroc" from an English one via the local name
    const rank = Math.min(...[fold(countryName(c.code, lang)), fold(countryName(c.code, 'en'))].map((name) => (name.startsWith(q) ? 0 : name.split(' ').some((w) => w.startsWith(q)) ? 1 : name.includes(q) ? 2 : c.code.toLowerCase() === q ? 0 : 9)));
    if (rank < 9) scored.push([rank, c]);
  }
  return scored.sort((a, b) => a[0] - b[0] || countryName(a[1].code, lang).localeCompare(countryName(b[1].code, lang), lang)).slice(0, limit).map((x) => x[1]);
}

/** Places that start with the text first, then those with a word that does, then those containing it. Dataset order (by population) breaks ties. */
export function searchPlaces(names: readonly string[], query: string, limit = 8): string[] {
  const q = fold(query);
  if (!q) return names.slice(0, limit);
  const starts: string[] = [], words: string[] = [], inside: string[] = [];
  for (const n of names) {
    const f = fold(n);
    if (f.startsWith(q)) starts.push(n);
    else if (f.split(' ').some((w) => w.startsWith(q))) words.push(n);
    else if (f.includes(q)) inside.push(n);
    if (starts.length >= limit) break;
  }
  return [...starts, ...words, ...inside].slice(0, limit);
}

/** Main time zone of countries that have one obvious answer. Everyone else picks from the browser's list. */
export const TIMEZONES: Record<string, string> = {
  MA: 'Africa/Casablanca', DZ: 'Africa/Algiers', TN: 'Africa/Tunis', EG: 'Africa/Cairo', LY: 'Africa/Tripoli', SN: 'Africa/Dakar', CI: 'Africa/Abidjan', NG: 'Africa/Lagos', KE: 'Africa/Nairobi', ZA: 'Africa/Johannesburg',
  FR: 'Europe/Paris', ES: 'Europe/Madrid', PT: 'Europe/Lisbon', IT: 'Europe/Rome', DE: 'Europe/Berlin', BE: 'Europe/Brussels', NL: 'Europe/Amsterdam', CH: 'Europe/Zurich', GB: 'Europe/London', IE: 'Europe/Dublin', TR: 'Europe/Istanbul', GR: 'Europe/Athens', PL: 'Europe/Warsaw', SE: 'Europe/Stockholm',
  AE: 'Asia/Dubai', SA: 'Asia/Riyadh', QA: 'Asia/Qatar', KW: 'Asia/Kuwait', BH: 'Asia/Bahrain', OM: 'Asia/Muscat', JO: 'Asia/Amman', LB: 'Asia/Beirut', IQ: 'Asia/Baghdad', IN: 'Asia/Kolkata', PK: 'Asia/Karachi', BD: 'Asia/Dhaka', SG: 'Asia/Singapore', MY: 'Asia/Kuala_Lumpur', TH: 'Asia/Bangkok', JP: 'Asia/Tokyo', KR: 'Asia/Seoul', CN: 'Asia/Shanghai',
  US: 'America/New_York', CA: 'America/Toronto', MX: 'America/Mexico_City', BR: 'America/Sao_Paulo', AR: 'America/Argentina/Buenos_Aires', CO: 'America/Bogota', CL: 'America/Santiago', AU: 'Australia/Sydney', NZ: 'Pacific/Auckland',
};

/** Time zones the browser knows, for the picker. */
export function timeZones(): string[] {
  try { return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone'); } catch { return Object.values(TIMEZONES); }
}

/** Every currency the clinic could pick: the countries' own, plus the browser's list. */
export function currencies(): string[] {
  const own = COUNTRIES.map((c) => c.currency).filter(Boolean);
  let all: string[] = [];
  try { all = (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('currency'); } catch { /* own list only */ }
  return [...new Set([...own, ...all])].sort();
}

/** Digits after the decimal point that the currency normally has (MAD 2, JPY 0, KWD 3). */
export function currencyDigits(currency: string): number {
  try { return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2; } catch { return 2; }
}

/**
 * An amount in a currency, in the reader's language: `1 500 MAD`, `1 500 €`, `$1,500.00`.
 * Whole amounts show no decimals, because the app keeps prices in whole units; anything else shows the currency's own digits.
 */
export function formatMoney(amount: number, currency: string, locale: string): string {
  const digits = currencyDigits(currency);
  const whole = Number.isInteger(amount);
  try { return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: whole ? 0 : digits, maximumFractionDigits: digits }).format(amount); }
  catch { return `${amount} ${currency}`; }
}

/** The currency the clinic used before it chose one: every existing clinic was set to dirhams. */
export const LEGACY_CURRENCY = 'MAD';

/** Records in another currency than the clinic's current one are kept as they are and left out of totals. */
export const inCurrency = <T extends { currency?: string }>(records: readonly T[], current: string): T[] => records.filter((r) => (r.currency ?? LEGACY_CURRENCY) === current);
