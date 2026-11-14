import type { Ctx } from './context';
import { ApiError, id, json, limit, readJson, str } from '../http';
import { newId } from '../crypto';
import { readChart } from '../../app/denteus/odontogram/engine/chart';
import * as exams from '../repo/examinations';
import * as patients from '../repo/patients';
import { audit } from '../repo/audit';

const MAX_CHART = 512_000;

/** The chart is validated by the same engine the browser uses. A payload the engine cannot read, or would have to rewrite lossily, is refused rather than stored. */
function chartJson(b: Record<string, unknown>): string {
  const raw = b['chart'];
  const text = JSON.stringify(raw ?? null);
  if (text.length > MAX_CHART) throw new ApiError(413, 'too_large', 'Chart is too large.');
  const r = readChart(raw);
  if (!r.chart) throw new ApiError(422, 'bad_chart', `Chart is not readable: ${r.issues[0]?.message ?? 'unknown'}.`);
  const lossy = r.issues.filter((i) => i.lossy);
  if (lossy.length) throw new ApiError(422, 'lossy_chart', `Chart has values the engine would change: ${lossy.slice(0, 3).map((i) => i.path).join(', ')}.`);
  return text;
}
const must = async (c: Ctx, eid: string) => {
  const e = await exams.get(c.db, c.s.clinicId, eid);
  if (!e) throw new ApiError(404, 'not_found', 'Examination not found.');
  return e;
};

export async function listForPatient(c: Ctx) {
  const pid = id(c.params[0]);
  if (!(await patients.exists(c.db, c.s.clinicId, pid))) throw new ApiError(404, 'not_found', 'Patient not found.');
  const before = c.url.searchParams.get('before');
  return json({ items: await exams.listForPatient(c.db, c.s.clinicId, pid, before ? id(before) : null, limit(c.url, 20, 50)) });
}
export const read = async (c: Ctx) => json(await must(c, id(c.params[0])));

export async function create(c: Ctx) {
  const pid = id(c.params[0]), b = await readJson(c.req, 600_000);
  if (!(await patients.exists(c.db, c.s.clinicId, pid))) throw new ApiError(404, 'not_found', 'Patient not found.');
  const eid = newId();
  await c.db.tx(async (t) => {
    await exams.insert(t, c.s.clinicId, { id: eid, patientId: pid, examinerId: c.s.staffId, chartJson: chartJson(b), note: str(b, 'note', { max: 2000, optional: true }) });
    await audit(t, c.s.clinicId, c.s.staffId, 'exam.create', 'examination', eid);
  });
  return json(await must(c, eid), 201);
}
export async function saveDraft(c: Ctx) {
  const eid = id(c.params[0]), b = await readJson(c.req, 600_000), e = await must(c, eid);
  if (e.status !== 'draft') throw new ApiError(409, 'immutable', 'A signed or voided examination cannot be edited. Create a correction instead.');
  const ok = await exams.updateDraft(c.db, c.s.clinicId, eid, chartJson(b), str(b, 'note', { max: 2000, optional: true }) ?? null);
  if (!ok) throw new ApiError(409, 'immutable', 'The examination was signed meanwhile.');
  return json(await must(c, eid));
}
export async function sign(c: Ctx) {
  const eid = id(c.params[0]), e = await must(c, eid);
  if (e.status !== 'draft') throw new ApiError(409, 'immutable', `This examination is already ${e.status}.`);
  const ok = await c.db.tx(async (t) => { const done = await exams.sign(t, c.s.clinicId, eid); if (done) await audit(t, c.s.clinicId, c.s.staffId, 'exam.sign', 'examination', eid); return done; });
  if (!ok) throw new ApiError(409, 'immutable', 'The examination changed meanwhile.');
  return json(await must(c, eid));
}
/** Voiding needs a reason and never deletes: the row stays, marked, with who and why. */
export async function voidExam(c: Ctx) {
  const eid = id(c.params[0]), reason = str(await readJson(c.req), 'reason', { min: 5, max: 500 }), e = await must(c, eid);
  if (e.status === 'void') throw new ApiError(409, 'immutable', 'Already voided.');
  const ok = await c.db.tx(async (t) => { const done = await exams.voidSigned(t, c.s.clinicId, eid, c.s.staffId, reason); if (done) await audit(t, c.s.clinicId, c.s.staffId, 'exam.void', 'examination', eid, reason); return done; });
  if (!ok) throw new ApiError(409, 'immutable', 'The examination changed meanwhile.');
  return json(await must(c, eid));
}
/** A correction is a NEW draft that points at the signed original; signing it supersedes the original in history, the original is untouched. */
export async function correct(c: Ctx) {
  const eid = id(c.params[0]), e = await must(c, eid);
  if (e.status !== 'signed') throw new ApiError(409, 'not_signed', 'Only a signed examination can be corrected.');
  if (e.supersededBy) throw new ApiError(409, 'already_corrected', 'A correction already exists.');
  const nid = newId();
  await c.db.tx(async (t) => {
    await exams.insert(t, c.s.clinicId, { id: nid, patientId: e.patientId, examinerId: c.s.staffId, supersedesId: eid, chartJson: JSON.stringify(e.chart) });
    await audit(t, c.s.clinicId, c.s.staffId, 'exam.correct', 'examination', nid, `supersedes ${eid}`);
  });
  return json(await must(c, nid), 201);
}
