import type { Ctx } from './context';
import { ApiError, id, instant, json, limit, oneOf, readJson, str } from '../http';
import { newId } from '../crypto';
import * as appts from '../repo/appointments';
import * as patients from '../repo/patients';
import * as staff from '../repo/staff';
import { audit } from '../repo/audit';

const MAX_MS = 12 * 3_600_000, MAX_RANGE_MS = 62 * 86_400_000;

/** Every id in the body must belong to the caller's clinic: the composite foreign keys are the backstop, this gives the clean 422. */
async function input(c: Ctx, b: Record<string, unknown>, exceptId?: string): Promise<appts.ApptInput> {
  const v: appts.ApptInput = { patientId: id(b['patientId'], 'patientId'), dentistId: id(b['dentistId'], 'dentistId'), chairId: id(b['chairId'], 'chairId'), type: oneOf(b, 'type', appts.TYPES),
    start: instant(b, 'start'), end: instant(b, 'end'), reason: str(b, 'reason', { max: 200, optional: true }), note: str(b, 'note', { max: 1000, optional: true }) };
  const len = +v.end - +v.start;
  if (len <= 0 || len > MAX_MS) throw new ApiError(400, 'invalid', 'end must be after start and within 12 hours.');
  if (!(await patients.exists(c.db, c.s.clinicId, v.patientId))) throw new ApiError(422, 'unknown_patient', 'Patient is not in this clinic.');
  if (!(await staff.isDentist(c.db, c.s.clinicId, v.dentistId))) throw new ApiError(422, 'unknown_dentist', 'Dentist is not an active dentist of this clinic.');
  if (!(await appts.chairExists(c.db, c.s.clinicId, v.chairId))) throw new ApiError(422, 'unknown_chair', 'Chair is not in this clinic.');
  if (await appts.conflicts(c.db, c.s.clinicId, { ...v, exceptId })) throw new ApiError(409, 'overlap', 'The dentist or chair is already booked then.');
  return v;
}

export async function list({ db, url, s }: Ctx) {
  const from = new Date(url.searchParams.get('from') ?? ''), to = new Date(url.searchParams.get('to') ?? '');
  if (Number.isNaN(+from) || Number.isNaN(+to) || +to <= +from) throw new ApiError(400, 'invalid', 'from and to (ISO-8601) are required.');
  if (+to - +from > MAX_RANGE_MS) throw new ApiError(400, 'invalid', 'Ask for at most 62 days at a time.');
  const d = url.searchParams.get('dentistId'), p = url.searchParams.get('patientId');
  return json({ items: await appts.inRange(db, s.clinicId, { from, to, dentistId: d ? id(d) : undefined, patientId: p ? id(p) : undefined, limit: limit(url, 500, 1000) }) });
}
export async function read({ db, s, params }: Ctx) {
  const a = await appts.get(db, s.clinicId, id(params[0]));
  if (!a) throw new ApiError(404, 'not_found', 'Appointment not found.');
  return json(a);
}
export async function create(c: Ctx) {
  const v = await input(c, await readJson(c.req)), aid = newId();
  await c.db.tx(async (t) => { await appts.insert(t, c.s.clinicId, aid, c.s.staffId, v); await audit(t, c.s.clinicId, c.s.staffId, 'appointment.create', 'appointment', aid); });
  return json(await appts.get(c.db, c.s.clinicId, aid), 201);
}
export async function update(c: Ctx) {
  const aid = id(c.params[0]), b = await readJson(c.req), version = Number(b['version']);
  if (!Number.isInteger(version)) throw new ApiError(400, 'invalid', 'version is required.');
  const cur = await appts.get(c.db, c.s.clinicId, aid);
  if (!cur) throw new ApiError(404, 'not_found', 'Appointment not found.');
  const v = await input(c, b, aid);
  const ok = await c.db.tx(async (t) => { const done = await appts.update(t, c.s.clinicId, aid, version, v); if (done) await audit(t, c.s.clinicId, c.s.staffId, 'appointment.update', 'appointment', aid); return done; });
  if (!ok) throw new ApiError(409, 'conflict', 'The appointment changed since you opened it.');
  return json(await appts.get(c.db, c.s.clinicId, aid));
}
export async function status(c: Ctx) {
  const aid = id(c.params[0]), b = await readJson(c.req), to = oneOf(b, 'status', appts.STATUSES);
  const cur = await appts.get(c.db, c.s.clinicId, aid);
  if (!cur) throw new ApiError(404, 'not_found', 'Appointment not found.');
  if (!appts.NEXT[cur.status]?.includes(to)) throw new ApiError(409, 'bad_transition', `An appointment that is ${cur.status} cannot become ${to}.`);
  const ok = await c.db.tx(async (t) => { const done = await appts.setStatus(t, c.s.clinicId, aid, c.s.staffId, cur.status, to, str(b, 'note', { max: 255, optional: true })); if (done) await audit(t, c.s.clinicId, c.s.staffId, `appointment.${to}`, 'appointment', aid); return done; });
  if (!ok) throw new ApiError(409, 'conflict', 'The appointment changed since you opened it.');
  return json(await appts.get(c.db, c.s.clinicId, aid));
}
