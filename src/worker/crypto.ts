const enc = new TextEncoder();
const b64url = (b: Uint8Array): string => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string): Uint8Array => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const hex = (b: ArrayBuffer): string => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');

export const randomToken = (bytes = 32): string => b64url(crypto.getRandomValues(new Uint8Array(bytes)));
export const sha256Hex = async (data: string | ArrayBuffer): Promise<string> => hex(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? enc.encode(data) : data));

/** 26 chars: 10 of millisecond time (sorts by creation) + 16 of randomness (Crockford base32). Not a secret, never guessable enough to rely on: every lookup is also clinic-scoped. */
const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function newId(now = Date.now()): string {
  let t = now, time = '';
  for (let i = 0; i < 10; i++) { time = ALPHA[t % 32] + time; t = Math.floor(t / 32); }
  return time + Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) => ALPHA[x % 32]).join('');
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a), y = enc.encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

/**
 * Passwords: PBKDF2-HMAC-SHA256 over HMAC(pepper, password), random 16-byte salt. Stored as `pbkdf2$<iterations>$<salt>$<hash>` so the cost can be raised later.
 * Workers' Web Crypto refuses more than 100,000 PBKDF2 iterations, below OWASP's 600,000 guidance for SHA-256; the pepper is the compensating control
 * and this is reported as an open decision (docs/architecture-tidb.md), not hidden.
 */
export const PBKDF2_ITERATIONS = 100_000;
async function derive(password: string, pepper: string, salt: Uint8Array, iterations: number): Promise<string> {
  const mac = await crypto.subtle.importKey('raw', enc.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const peppered = await crypto.subtle.sign('HMAC', mac, enc.encode(password.normalize('NFKC')));
  const key = await crypto.subtle.importKey('raw', peppered, 'PBKDF2', false, ['deriveBits']);
  return b64url(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256)));
}
export async function hashPassword(password: string, pepper: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${iterations}$${b64url(salt)}$${await derive(password, pepper, salt, iterations)}`;
}
export async function verifyPassword(password: string, stored: string, pepper: string): Promise<boolean> {
  const [algo, it, salt, hash] = stored.split('$');
  if (algo !== 'pbkdf2' || !salt || !hash || !Number.isInteger(+it)) return false;
  return safeEqual(await derive(password, pepper, unb64url(salt), +it), hash);
}
/** Do the same work for an unknown account so response time does not reveal which e-mails exist. */
export const DUMMY_HASH = 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export const validPassword = (p: string): boolean => p.length >= 12 && p.length <= 200;
