import type { Db } from '../db';
import { fromDb, nowDb } from '../time';

export const KINDS = ['document', 'xray', 'photo', 'pdf', 'other'] as const;
export interface FileRow { id: string; patientId: string | null; kind: string; r2Key: string; filename: string; mime: string; sizeBytes: number; sha256: string; uploadedBy: string; createdAt: string | null }
const COLS = 'id, patient_id, kind, r2_key, filename, mime, size_bytes, sha256, uploaded_by, created_at';
const out = (r: any): FileRow => ({ id: r.id, patientId: r.patient_id, kind: r.kind, r2Key: r.r2_key, filename: r.filename, mime: r.mime, sizeBytes: Number(r.size_bytes), sha256: r.sha256, uploadedBy: r.uploaded_by, createdAt: fromDb(r.created_at) });

export async function get(db: Pick<Db, 'rows'>, clinicId: string, id: string): Promise<FileRow | null> {
  const r = (await db.rows(`SELECT ${COLS} FROM file_object WHERE clinic_id = ? AND id = ? AND deleted_at IS NULL`, [clinicId, id]))[0];
  return r ? out(r) : null;
}
export async function list(db: Db, clinicId: string, o: { patientId?: string; before: string | null; limit: number }) {
  const where = ['clinic_id = ?', 'deleted_at IS NULL'], p: unknown[] = [clinicId];
  if (o.patientId) { where.push('patient_id = ?'); p.push(o.patientId); }
  if (o.before) { where.push('id < ?'); p.push(o.before); }
  return (await db.rows(`SELECT ${COLS} FROM file_object WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`, [...p, o.limit])).map(out);
}
export const insert = (db: Pick<Db, 'run'>, clinicId: string, f: Omit<FileRow, 'createdAt' | 'sizeBytes'> & { sizeBytes: number }) =>
  db.run('INSERT INTO file_object (id, clinic_id, patient_id, kind, r2_key, filename, mime, size_bytes, sha256, uploaded_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [f.id, clinicId, f.patientId, f.kind, f.r2Key, f.filename, f.mime, f.sizeBytes, f.sha256, f.uploadedBy, nowDb()]);
/** Soft delete: the row (and the R2 object, until a purge job decides otherwise) stays so the audit trail still resolves. */
export async function softDelete(db: Pick<Db, 'run'>, clinicId: string, id: string, by: string): Promise<boolean> {
  return (await db.run('UPDATE file_object SET deleted_at = ?, deleted_by = ? WHERE clinic_id = ? AND id = ? AND deleted_at IS NULL', [nowDb(), by, clinicId, id])) === 1;
}
