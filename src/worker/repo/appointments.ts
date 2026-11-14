import type { Db } from '../db';
import { newId } from '../crypto';
import { fromDb, nowDb, toDb } from '../time';

export const STATUSES = ['scheduled', 'confirmed', 'arrived', 'in-progress', 'completed', 'cancelled', 'no-show'] as const;
export const TYPES = ['consultation', 'checkup', 'cleaning', 'filling', 'root-canal', 'extraction', 'orthodontics', 'emergency'] as const;
export interface ApptInput { patientId: string; dentistId: string; chairId: string; type: string; start: Date; end: Date; reason?: string; note?: string }
const COLS = 'id, patient_id, dentist_id, chair_id, type, status, start_at, end_at, reason, note, version, created_at, updated_at';
const out = (r: any) => ({ id: r.id, patientId: r.patient_id, dentistId: r.dentist_id, chairId: r.chair_id, type: r.type, status: r.status, start: fromDb(r.start_at), end: fromDb(r.end_at),
  reason: r.reason, note: r.note, version: r.version, createdAt: fromDb(r.created_at), updatedAt: fromDb(r.updated_at) });

export const chairExists = async (db: Pick<Db, 'rows'>, clinicId: string, id: string) => (await db.rows('SELECT 1 AS ok FROM chair WHERE clinic_id = ? AND id = ?', [clinicId, id])).length > 0;
export async function get(db: Pick<Db, 'rows'>, clinicId: string, id: string) {
  const r = (await db.rows(`SELECT ${COLS} FROM appointment WHERE clinic_id = ? AND id = ?`, [clinicId, id]))[0];
  return r ? out(r) : null;
}
/** A bounded window, never the whole table. */
export async function inRange(db: Db, clinicId: string, o: { from: Date; to: Date; dentistId?: string; patientId?: string; limit: number }) {
  const where = ['clinic_id = ?', 'start_at >= ?', 'start_at < ?'], p: unknown[] = [clinicId, toDb(o.from), toDb(o.to)];
  if (o.dentistId) { where.push('dentist_id = ?'); p.push(o.dentistId); }
  if (o.patientId) { where.push('patient_id = ?'); p.push(o.patientId); }
  return (await db.rows(`SELECT ${COLS} FROM appointment WHERE ${where.join(' AND ')} ORDER BY start_at, id LIMIT ?`, [...p, o.limit])).map(out);
}
export async function insert(db: Pick<Db, 'run'>, clinicId: string, id: string, by: string, v: ApptInput) {
  const now = nowDb();
  await db.run('INSERT INTO appointment (id, clinic_id, patient_id, dentist_id, chair_id, type, start_at, end_at, reason, note, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [id, clinicId, v.patientId, v.dentistId, v.chairId, v.type, toDb(v.start), toDb(v.end), v.reason ?? null, v.note ?? null, by, now, now]);
  await history(db, clinicId, id, by, null, 'scheduled');
}
export async function update(db: Pick<Db, 'run'>, clinicId: string, id: string, version: number, v: ApptInput): Promise<boolean> {
  return (await db.run('UPDATE appointment SET patient_id=?, dentist_id=?, chair_id=?, type=?, start_at=?, end_at=?, reason=?, note=?, version = version + 1, updated_at=? WHERE clinic_id=? AND id=? AND version=?',
    [v.patientId, v.dentistId, v.chairId, v.type, toDb(v.start), toDb(v.end), v.reason ?? null, v.note ?? null, nowDb(), clinicId, id, version])) === 1;
}
export async function setStatus(db: Pick<Db, 'run'>, clinicId: string, id: string, by: string, from: string, to: string, note?: string): Promise<boolean> {
  // `status = from` makes two simultaneous changes impossible: the loser affects zero rows.
  const ok = (await db.run('UPDATE appointment SET status = ?, version = version + 1, updated_at = ? WHERE clinic_id = ? AND id = ? AND status = ?', [to, nowDb(), clinicId, id, from])) === 1;
  if (ok) await history(db, clinicId, id, by, from, to, note);
  return ok;
}
const history = (db: Pick<Db, 'run'>, clinicId: string, id: string, by: string, from: string | null, to: string, note?: string) =>
  db.run('INSERT INTO appointment_status_change (id, clinic_id, appointment_id, at, by_staff_id, from_status, to_status, note) VALUES (?,?,?,?,?,?,?,?)', [newId(), clinicId, id, nowDb(), by, from, to, note ?? null]);

/** Another live appointment for the same dentist or chair that overlaps [start, end). */
export async function conflicts(db: Pick<Db, 'rows'>, clinicId: string, o: { start: Date; end: Date; dentistId: string; chairId: string; exceptId?: string }) {
  const rows = await db.rows(
    `SELECT id FROM appointment WHERE clinic_id = ? AND status NOT IN ('cancelled','no-show') AND start_at < ? AND end_at > ? AND (dentist_id = ? OR chair_id = ?) ${o.exceptId ? 'AND id <> ?' : ''} LIMIT 1`,
    [clinicId, toDb(o.end), toDb(o.start), o.dentistId, o.chairId, ...(o.exceptId ? [o.exceptId] : [])]);
  return rows.length > 0;
}
export const NEXT: Record<string, readonly string[]> = {
  scheduled: ['confirmed', 'arrived', 'cancelled', 'no-show'], confirmed: ['arrived', 'cancelled', 'no-show'], arrived: ['in-progress', 'cancelled'],
  'in-progress': ['completed'], completed: [], cancelled: [], 'no-show': [],
};
