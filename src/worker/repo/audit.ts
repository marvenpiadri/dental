import type { Db } from '../db';
import { newId } from '../crypto';
import { fromDb, nowDb } from '../time';

type Writer = Pick<Db, 'run'>;
/** Insert and read only. There is deliberately no update or delete here; nothing else in the Worker issues SQL against audit_event. */
export const audit = (db: Writer, clinicId: string, actor: string | null, action: string, entityType: string, entityId: string | null, detail?: string) =>
  db.run('INSERT INTO audit_event (id, clinic_id, at, actor_staff_id, action, entity_type, entity_id, detail) VALUES (?,?,?,?,?,?,?,?)',
    [newId(), clinicId, nowDb(), actor, action, entityType, entityId, detail?.slice(0, 1000) ?? null]);

export async function listAudit(db: Db, clinicId: string, before: string | null, limit: number) {
  const rows = await db.rows(`SELECT id, at, actor_staff_id, action, entity_type, entity_id, detail FROM audit_event WHERE clinic_id = ? ${before ? 'AND id < ?' : ''} ORDER BY id DESC LIMIT ?`,
    before ? [clinicId, before, limit] : [clinicId, limit]);
  return rows.map((r) => ({ id: r.id, at: fromDb(r.at), actorStaffId: r.actor_staff_id, action: r.action, entityType: r.entity_type, entityId: r.entity_id, detail: r.detail }));
}
