import type { Db } from '../db';
import { fromDb, nowDb } from '../time';

export interface PatientInput { fullName: string; phone: string; email?: string; birthDate?: string; sex?: 'female' | 'male'; country?: string; city?: string; alert?: string; notes?: string }
const out = (r: any) => ({ id: r.id, fullName: r.full_name, phone: r.phone, email: r.email, birthDate: r.birth_date, sex: r.sex, country: r.country, city: r.city, alert: r.alert, notes: r.notes,
  archivedAt: fromDb(r.archived_at), version: r.version, createdAt: fromDb(r.created_at), updatedAt: fromDb(r.updated_at) });
const COLS = 'id, full_name, phone, email, birth_date, sex, country, city, alert, notes, archived_at, version, created_at, updated_at';

export async function get(db: Pick<Db, 'rows'>, clinicId: string, id: string) {
  const r = (await db.rows(`SELECT ${COLS} FROM patient WHERE clinic_id = ? AND id = ?`, [clinicId, id]))[0];
  return r ? out(r) : null;
}
export const exists = async (db: Pick<Db, 'rows'>, clinicId: string, id: string) => (await db.rows('SELECT 1 AS ok FROM patient WHERE clinic_id = ? AND id = ?', [clinicId, id])).length > 0;

/** Keyset pagination on (full_name, id). `cursor` is opaque to clients. */
export async function search(db: Db, clinicId: string, o: { q?: string; archived: boolean; cursor?: { name: string; id: string }; limit: number }) {
  const where = ['clinic_id = ?'], p: unknown[] = [clinicId];
  if (!o.archived) where.push('archived_at IS NULL');
  if (o.q) { where.push('(full_name LIKE ? OR phone LIKE ?)'); const like = `${o.q.replace(/[\\%_]/g, '\\$&')}%`; p.push(like, like); }
  if (o.cursor) { where.push('(full_name > ? OR (full_name = ? AND id > ?))'); p.push(o.cursor.name, o.cursor.name, o.cursor.id); }
  const rows = await db.rows(`SELECT ${COLS} FROM patient WHERE ${where.join(' AND ')} ORDER BY full_name, id LIMIT ?`, [...p, o.limit + 1]);
  const page = rows.slice(0, o.limit).map(out);
  return { items: page, next: rows.length > o.limit ? { name: rows[o.limit - 1].full_name as string, id: rows[o.limit - 1].id as string } : null };
}
export async function insert(db: Pick<Db, 'run'>, clinicId: string, id: string, v: PatientInput) {
  const now = nowDb();
  await db.run('INSERT INTO patient (id, clinic_id, full_name, phone, email, birth_date, sex, country, city, alert, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [id, clinicId, v.fullName, v.phone, v.email ?? null, v.birthDate ?? null, v.sex ?? null, v.country ?? null, v.city ?? null, v.alert ?? null, v.notes ?? null, now, now]);
}
/** Optimistic concurrency: returns false when the row changed since the caller read it (or is not in this clinic). */
export async function update(db: Pick<Db, 'run'>, clinicId: string, id: string, version: number, v: PatientInput): Promise<boolean> {
  return (await db.run('UPDATE patient SET full_name=?, phone=?, email=?, birth_date=?, sex=?, country=?, city=?, alert=?, notes=?, version = version + 1, updated_at=? WHERE clinic_id=? AND id=? AND version=?',
    [v.fullName, v.phone, v.email ?? null, v.birthDate ?? null, v.sex ?? null, v.country ?? null, v.city ?? null, v.alert ?? null, v.notes ?? null, nowDb(), clinicId, id, version])) === 1;
}
export const setArchived = (db: Pick<Db, 'run'>, clinicId: string, id: string, on: boolean) =>
  db.run('UPDATE patient SET archived_at = ?, version = version + 1, updated_at = ? WHERE clinic_id = ? AND id = ?', [on ? nowDb() : null, nowDb(), clinicId, id]);
