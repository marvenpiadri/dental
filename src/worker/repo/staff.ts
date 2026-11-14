import type { Db } from '../db';
import type { Role } from '../../app/core/auth/auth-rules';
import { fromDb } from '../time';

export interface StaffRow { id: string; clinicId: string; name: string; role: Role; status: 'active' | 'suspended' | 'deactivated'; passwordHash: string; failedLogins: number; lockedUntil: string | null; clinicStatus: string }
const map = (r: any): StaffRow => ({ id: r.id, clinicId: r.clinic_id, name: r.name, role: r.role, status: r.status, passwordHash: r.password_hash, failedLogins: r.failed_logins, lockedUntil: r.locked_until, clinicStatus: r.clinic_status });

export const findByEmail = async (db: Db, emailNorm: string): Promise<StaffRow | null> =>
  (await db.rows('SELECT t.*, c.status AS clinic_status FROM staff t JOIN clinic c ON c.id = t.clinic_id WHERE t.email_norm = ?', [emailNorm])).map(map)[0] ?? null;

export const findInClinic = async (db: Pick<Db, 'rows'>, clinicId: string, staffId: string): Promise<StaffRow | null> =>
  (await db.rows('SELECT t.*, c.status AS clinic_status FROM staff t JOIN clinic c ON c.id = t.clinic_id WHERE t.clinic_id = ? AND t.id = ?', [clinicId, staffId])).map(map)[0] ?? null;

export const listInClinic = (db: Db, clinicId: string) =>
  db.rows('SELECT id, name, role, status FROM staff WHERE clinic_id = ? ORDER BY name LIMIT 200', [clinicId]);

export const recordFailure = (db: Db, id: string, lockUntil: string | null) =>
  db.run('UPDATE staff SET failed_logins = failed_logins + 1, locked_until = COALESCE(?, locked_until) WHERE id = ?', [lockUntil, id]);
export const clearFailures = (db: Db, id: string) => db.run('UPDATE staff SET failed_logins = 0, locked_until = NULL WHERE id = ?', [id]);
export const setPassword = (db: Pick<Db, 'run'>, clinicId: string, id: string, hash: string, at: string) =>
  db.run('UPDATE staff SET password_hash = ?, password_changed_at = ?, failed_logins = 0, locked_until = NULL WHERE clinic_id = ? AND id = ?', [hash, at, clinicId, id]);
export const setStatus = (db: Pick<Db, 'run'>, clinicId: string, id: string, status: string, reason: string | null) =>
  db.run('UPDATE staff SET status = ?, status_reason = ? WHERE clinic_id = ? AND id = ?', [status, reason, clinicId, id]);
export const isDentist = async (db: Pick<Db, 'rows'>, clinicId: string, id: string) =>
  (await db.rows("SELECT 1 AS ok FROM staff WHERE clinic_id = ? AND id = ? AND role = 'dentist' AND status = 'active'", [clinicId, id])).length > 0;
export const countActiveOwners = async (db: Pick<Db, 'rows'>, clinicId: string, exceptId: string) =>
  Number((await db.rows("SELECT COUNT(*) AS n FROM staff WHERE clinic_id = ? AND role = 'owner' AND status = 'active' AND id <> ?", [clinicId, exceptId]))[0]?.n ?? 0);
