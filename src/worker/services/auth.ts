import type { Db } from '../db';
import type { Env, SessionView } from '../env';
import { ApiError, cookie, parseCookies } from '../http';
import { DUMMY_HASH, hashPassword, randomToken, safeEqual, sha256Hex, validPassword, verifyPassword } from '../crypto';
import { effective, type Permission, type Role } from '../../app/core/auth/auth-rules';
import * as staff from '../repo/staff';
import * as sessions from '../repo/sessions';
import { audit } from '../repo/audit';
import { toDb } from '../time';

export const IDLE_MS = 2 * 60 * 60_000;       // sign out after 2 h without use (decision pending)
export const ABSOLUTE_MS = 12 * 60 * 60_000;  // and after 12 h regardless
const TOUCH_AFTER_MS = 5 * 60_000;            // write last_seen at most every 5 min
const LOCK_AFTER = 5, LOCK_MS = 15 * 60_000;

export interface Session { tokenHash: string; clinicId: string; staffId: string; name: string; role: Role; permissions: Set<Permission>; csrf: string }

const secure = (req: Request, env: Env): boolean => env.ENVIRONMENT === 'production' || new URL(req.url).protocol === 'https:';
export const cookieName = (req: Request, env: Env): string => (secure(req, env) ? '__Host-dl_session' : 'dl_session');

export const view = (s: Session): SessionView => ({ staffId: s.staffId, clinicId: s.clinicId, name: s.name, role: s.role, permissions: [...s.permissions].sort(), csrf: s.csrf });

/** Resolves the cookie to a live session, or null. Used for API calls and, before rendering, for Angular SSR. */
export async function authenticate(req: Request, env: Env, db: Db, now = new Date()): Promise<Session | null> {
  const token = parseCookies(req.headers.get('cookie'))[cookieName(req, env)];
  if (!token || token.length < 40 || token.length > 64) return null;
  const live = await sessions.loadLive(db, await sha256Hex(token), now);
  if (!live) return null;
  if (+now - Date.parse(`${live.lastSeen.replace(' ', 'T')}Z`) > TOUCH_AFTER_MS) await sessions.touch(db, live.tokenHash, now, IDLE_MS);
  const extra = live.permissions.filter((p) => p.effect === 'extra').map((p) => p.permission as Permission);
  const removed = live.permissions.filter((p) => p.effect === 'removed').map((p) => p.permission as Permission);
  return { tokenHash: live.tokenHash, clinicId: live.clinicId, staffId: live.staffId, name: live.name, role: live.role as Role, csrf: live.csrf,
    permissions: effective({ role: live.role as Role, extra, removed }) };
}

/** State-changing requests must carry the session's CSRF token and, when the browser sends one, a same-origin Origin. */
export function checkCsrf(req: Request, env: Env, s: Session): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  checkOrigin(req, env);
  const sent = req.headers.get('x-csrf-token');
  if (!sent || !safeEqual(sent, s.csrf)) throw new ApiError(403, 'csrf', 'Missing or wrong CSRF token.');
}
export function checkOrigin(req: Request, env: Env): void {
  const origin = req.headers.get('origin');
  if (!origin) return;
  const allowed = new Set([new URL(req.url).origin, env.APP_ORIGIN?.replace(/\/$/, '')]);
  if (!allowed.has(origin)) throw new ApiError(403, 'origin', 'Cross-origin request refused.');
}

export const need = (s: Session, p: Permission): void => { if (!s.permissions.has(p)) throw new ApiError(403, 'forbidden', 'Your role cannot do this.'); };

async function open(db: Db, env: Env, req: Request, st: staff.StaffRow): Promise<{ session: SessionView; setCookie: string }> {
  const token = randomToken(), csrf = randomToken(32), now = new Date();
  await sessions.create(db, { tokenHash: await sha256Hex(token), clinicId: st.clinicId, staffId: st.id, csrf, now, idleMs: IDLE_MS, absoluteMs: ABSOLUTE_MS, userAgent: req.headers.get('user-agent') });
  await audit(db, st.clinicId, st.id, 'auth.login', 'staff', st.id);
  const created = (await authenticate(new Request(req.url, { headers: { cookie: `${cookieName(req, env)}=${token}` } }), env, db, now))!;
  return { session: view(created),
    setCookie: cookie(cookieName(req, env), token, { secure: secure(req, env), maxAge: ABSOLUTE_MS / 1000 }) };
}

export async function login(db: Db, env: Env, req: Request, email: string, password: string) {
  checkOrigin(req, env);
  const st = await staff.findByEmail(db, email.trim().toLowerCase());
  const now = new Date();
  const locked = !!st?.lockedUntil && Date.parse(`${st.lockedUntil.replace(' ', 'T')}Z`) > +now;
  const ok = await verifyPassword(password, st && !locked ? st.passwordHash : DUMMY_HASH, env.PASSWORD_PEPPER);
  if (!st || locked || !ok) {
    if (st && !locked) {
      await staff.recordFailure(db, st.id, st.failedLogins + 1 >= LOCK_AFTER ? toDb(new Date(+now + LOCK_MS)) : null);
      await audit(db, st.clinicId, st.id, 'auth.login_failed', 'staff', st.id);
    }
    throw new ApiError(401, 'invalid_credentials', 'E-mail or password is wrong.');
  }
  if (st.status !== 'active' || st.clinicStatus !== 'active') throw new ApiError(403, 'account_suspended', 'This account is not active. Ask the clinic owner.');
  await staff.clearFailures(db, st.id);
  return open(db, env, req, st);
}

export async function logout(db: Db, s: Session): Promise<void> {
  await sessions.revoke(db, s.tokenHash, 'logout', new Date());
  await audit(db, s.clinicId, s.staffId, 'auth.logout', 'staff', s.staffId);
}
export const clearCookie = (req: Request, env: Env): string => cookie(cookieName(req, env), '', { secure: secure(req, env), maxAge: 0 });

export async function changePassword(db: Db, env: Env, s: Session, current: string, next: string): Promise<void> {
  if (!validPassword(next)) throw new ApiError(400, 'weak_password', 'Use at least 12 characters.');
  const st = await staff.findInClinic(db, s.clinicId, s.staffId);
  if (!st || !(await verifyPassword(current, st.passwordHash, env.PASSWORD_PEPPER))) throw new ApiError(403, 'invalid_credentials', 'Current password is wrong.');
  const hash = await hashPassword(next, env.PASSWORD_PEPPER), now = new Date();
  await db.tx(async (t) => {
    await staff.setPassword(t, s.clinicId, s.staffId, hash, toDb(now));
    await sessions.revokeAllFor(t, s.clinicId, s.staffId, 'password_changed', now, s.tokenHash);
    await audit(t, s.clinicId, s.staffId, 'auth.password_changed', 'staff', s.staffId);
  });
}

/** An owner/admin issues a one-time link (valid 1 h); the token is shown once and only its hash is stored. */
export async function issueReset(db: Db, s: Session, targetId: string): Promise<{ token: string; expiresAt: string }> {
  const token = randomToken(), exp = new Date(Date.now() + 60 * 60_000);
  await db.run('INSERT INTO password_reset (token_hash, clinic_id, staff_id, issued_by, expires_at) VALUES (?,?,?,?,?)', [await sha256Hex(token), s.clinicId, targetId, s.staffId, toDb(exp)]);
  await audit(db, s.clinicId, s.staffId, 'auth.reset_issued', 'staff', targetId);
  return { token, expiresAt: exp.toISOString() };
}
export async function redeemReset(db: Db, env: Env, req: Request, token: string, password: string): Promise<void> {
  checkOrigin(req, env);
  if (!validPassword(password)) throw new ApiError(400, 'weak_password', 'Use at least 12 characters.');
  const th = await sha256Hex(token), now = new Date();
  const hash = await hashPassword(password, env.PASSWORD_PEPPER);
  await db.tx(async (t) => {
    // The conditional UPDATE is the single-use guarantee: only one redeemer sees one affected row.
    const used = await t.run('UPDATE password_reset SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?', [toDb(now), th, toDb(now)]);
    if (used !== 1) throw new ApiError(400, 'invalid_token', 'This link is invalid or has expired.');
    const r = (await t.rows('SELECT clinic_id, staff_id FROM password_reset WHERE token_hash = ?', [th]))[0];
    await staff.setPassword(t, r.clinic_id, r.staff_id, hash, toDb(now));
    await sessions.revokeAllFor(t, r.clinic_id, r.staff_id, 'password_reset', now);
    await audit(t, r.clinic_id, r.staff_id, 'auth.password_reset', 'staff', r.staff_id);
  });
}
