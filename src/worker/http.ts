export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message = code) { super(message); }
}
export const bad = (message: string, code = 'invalid'): ApiError => new ApiError(400, code, message);

const SECURITY = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Referrer-Policy': 'same-origin' };
export const json = (data: unknown, status = 200, headers: HeadersInit = {}): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...SECURITY, ...headers } });

/** Reads a JSON object body, refusing anything over maxBytes before it is parsed. */
export async function readJson(req: Request, maxBytes = 262_144): Promise<Record<string, unknown>> {
  const type = req.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('application/json')) throw new ApiError(415, 'unsupported_media_type', 'Send application/json.');
  const text = await req.text();
  if (text.length > maxBytes) throw new ApiError(413, 'too_large', 'Request body is too large.');
  try { const v = JSON.parse(text); if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>; } catch { /* falls through */ }
  throw bad('Body must be a JSON object.');
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim(); }
  return out;
}
export const cookie = (name: string, value: string, o: { secure: boolean; maxAge: number }): string =>
  `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${o.maxAge}${o.secure ? '; Secure' : ''}`;

// --- validators: one small set, used by every handler -------------------------------------------------------------
type Src = Record<string, unknown>;
export function str(o: Src, k: string, opt: { min?: number; max: number; optional?: false }): string;
export function str(o: Src, k: string, opt: { min?: number; max: number; optional: true }): string | undefined;
export function str(o: Src, k: string, opt: { min?: number; max: number; optional?: boolean }): string | undefined {
  const v = o[k];
  if (v === undefined || v === null || v === '') { if (opt.optional) return undefined; throw bad(`${k} is required.`); }
  if (typeof v !== 'string') throw bad(`${k} must be text.`);
  const s = v.trim();
  if (s.length < (opt.min ?? 1) || s.length > opt.max) throw bad(`${k} must be ${opt.min ?? 1}–${opt.max} characters.`);
  return s;
}
export function oneOf<T extends string>(o: Src, k: string, allowed: readonly T[]): T;
export function oneOf<T extends string>(o: Src, k: string, allowed: readonly T[], optional: true): T | undefined;
export function oneOf<T extends string>(o: Src, k: string, allowed: readonly T[], optional = false): T | undefined {
  const v = o[k];
  if (v === undefined && optional) return undefined;
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) throw bad(`${k} must be one of: ${allowed.join(', ')}.`);
  return v as T;
}
export const ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
export function id(v: unknown, name = 'id'): string { if (typeof v !== 'string' || !ID.test(v)) throw new ApiError(404, 'not_found', `${name} not found.`); return v; }
export function instant(o: Src, k: string): Date {
  const v = o[k]; const d = typeof v === 'string' ? new Date(v) : new Date(NaN);
  if (Number.isNaN(+d)) throw bad(`${k} must be an ISO-8601 date-time.`);
  return d;
}
export function limit(url: URL, def = 50, max = 100): number {
  const n = Number(url.searchParams.get('limit') ?? def);
  if (!Number.isInteger(n) || n < 1) throw bad('limit must be a positive integer.');
  return Math.min(n, max);
}
