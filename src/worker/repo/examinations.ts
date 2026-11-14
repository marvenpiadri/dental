import type { Db } from '../db';
import { fromDb, nowDb } from '../time';

export interface ExamRow { id: string; patientId: string; examinerId: string; status: 'draft' | 'signed' | 'void'; supersedesId: string | null; chart: unknown; note: string | null;
  signedAt: string | null; voidedAt: string | null; voidedBy: string | null; voidReason: string | null; createdAt: string | null; supersededBy: string | null }
const COLS = `e.id, e.patient_id, e.examiner_id, e.status, e.supersedes_id, e.chart_json, e.note, e.signed_at, e.voided_at, e.voided_by, e.void_reason, e.created_at,
  (SELECT n.id FROM examination n WHERE n.clinic_id = e.clinic_id AND n.supersedes_id = e.id AND n.status <> 'void' LIMIT 1) AS superseded_by`;
const out = (r: any): ExamRow => ({ id: r.id, patientId: r.patient_id, examinerId: r.examiner_id, status: r.status, supersedesId: r.supersedes_id,
  chart: typeof r.chart_json === 'string' ? JSON.parse(r.chart_json) : r.chart_json, note: r.note, signedAt: fromDb(r.signed_at), voidedAt: fromDb(r.voided_at), voidedBy: r.voided_by,
  voidReason: r.void_reason, createdAt: fromDb(r.created_at), supersededBy: r.superseded_by });

export async function get(db: Pick<Db, 'rows'>, clinicId: string, id: string): Promise<ExamRow | null> {
  const r = (await db.rows(`SELECT ${COLS} FROM examination e WHERE e.clinic_id = ? AND e.id = ?`, [clinicId, id]))[0];
  return r ? out(r) : null;
}
export async function listForPatient(db: Db, clinicId: string, patientId: string, before: string | null, limit: number) {
  const rows = await db.rows(`SELECT ${COLS} FROM examination e WHERE e.clinic_id = ? AND e.patient_id = ? ${before ? 'AND e.id < ?' : ''} ORDER BY e.id DESC LIMIT ?`,
    before ? [clinicId, patientId, before, limit] : [clinicId, patientId, limit]);
  return rows.map(out);
}
export const insert = (db: Pick<Db, 'run'>, clinicId: string, v: { id: string; patientId: string; examinerId: string; supersedesId?: string; chartJson: string; note?: string }) =>
  db.run('INSERT INTO examination (id, clinic_id, patient_id, examiner_id, status, supersedes_id, chart_json, note, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    [v.id, clinicId, v.patientId, v.examinerId, 'draft', v.supersedesId ?? null, v.chartJson, v.note ?? null, nowDb()]);
/** Only a DRAFT can change; the status condition is the immutability rule, enforced where the row is written. */
export async function updateDraft(db: Pick<Db, 'run'>, clinicId: string, id: string, chartJson: string, note: string | null): Promise<boolean> {
  return (await db.run("UPDATE examination SET chart_json = ?, note = ? WHERE clinic_id = ? AND id = ? AND status = 'draft'", [chartJson, note, clinicId, id])) === 1;
}
export async function sign(db: Pick<Db, 'run'>, clinicId: string, id: string): Promise<boolean> {
  return (await db.run("UPDATE examination SET status = 'signed', signed_at = ? WHERE clinic_id = ? AND id = ? AND status = 'draft'", [nowDb(), clinicId, id])) === 1;
}
export async function voidSigned(db: Pick<Db, 'run'>, clinicId: string, id: string, by: string, reason: string): Promise<boolean> {
  return (await db.run("UPDATE examination SET status = 'void', voided_at = ?, voided_by = ?, void_reason = ? WHERE clinic_id = ? AND id = ? AND status IN ('draft','signed')", [nowDb(), by, reason, clinicId, id])) === 1;
}
