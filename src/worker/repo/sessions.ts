import type { Db } from '../db';
import { toDb } from '../time';

export interface LiveSession {
  tokenHash: string; clinicId: string; staffId: string; csrf: string; lastSeen: string;
  name: string; role: string; permissions: { permission: string; effect: 'extra' | 'removed' }[];
}

export const create = (db: Db, s: { tokenHash: string; clinicId: string; staffId: string; csrf: string; now: Date; idleMs: number; absoluteMs: number; userAgent: string | null }) =>
  db.run('INSERT INTO auth_session (token_hash, clinic_id, staff_id, csrf_token, created_at, last_seen_at, idle_expires_at, expires_at, user_agent) VALUES (?,?,?,?,?,?,?,?,?)',
    [s.tokenHash, s.clinicId, s.staffId, s.csrf, toDb(s.now), toDb(s.now), toDb(new Date(+s.now + s.idleMs)), toDb(new Date(+s.now + s.absoluteMs)), s.userAgent?.slice(0, 200) ?? null]);

/** One query: the session, the person as they are NOW (role, status, suspension) and their permission overrides. Nothing is trusted from the cookie but the token. */
export async function loadLive(db: Db, tokenHash: string, now: Date): Promise<LiveSession | null> {
  const n = toDb(now);
  const rows = await db.rows(
    `SELECT s.token_hash, s.clinic_id, s.staff_id, s.csrf_token, s.last_seen_at, t.name, t.role, p.permission, p.effect
       FROM auth_session s
       JOIN staff t ON t.clinic_id = s.clinic_id AND t.id = s.staff_id AND t.status = 'active'
       JOIN clinic c ON c.id = s.clinic_id AND c.status = 'active'
       LEFT JOIN staff_permission p ON p.clinic_id = t.clinic_id AND p.staff_id = t.id
      WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.idle_expires_at > ? AND s.expires_at > ?`, [tokenHash, n, n]);
  if (!rows.length) return null;
  const r = rows[0];
  return { tokenHash: r.token_hash, clinicId: r.clinic_id, staffId: r.staff_id, csrf: r.csrf_token, lastSeen: r.last_seen_at, name: r.name, role: r.role,
    permissions: rows.filter((x) => x.permission).map((x) => ({ permission: x.permission, effect: x.effect })) };
}
export const touch = (db: Db, tokenHash: string, now: Date, idleMs: number) =>
  db.run('UPDATE auth_session SET last_seen_at = ?, idle_expires_at = LEAST(?, expires_at) WHERE token_hash = ?', [toDb(now), toDb(new Date(+now + idleMs)), tokenHash]);
export const revoke = (db: Pick<Db, 'run'>, tokenHash: string, reason: string, now: Date) =>
  db.run('UPDATE auth_session SET revoked_at = ?, revoked_reason = ? WHERE token_hash = ? AND revoked_at IS NULL', [toDb(now), reason, tokenHash]);
/** Revokes every live session of one person, optionally keeping the one making the request. */
export const revokeAllFor = (db: Pick<Db, 'run'>, clinicId: string, staffId: string, reason: string, now: Date, keep?: string) =>
  db.run(`UPDATE auth_session SET revoked_at = ?, revoked_reason = ? WHERE clinic_id = ? AND staff_id = ? AND revoked_at IS NULL ${keep ? 'AND token_hash <> ?' : ''}`,
    keep ? [toDb(now), reason, clinicId, staffId, keep] : [toDb(now), reason, clinicId, staffId]);
