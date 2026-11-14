import type { Ctx } from './context';
import { ApiError, id, json, limit, oneOf, readJson, str } from '../http';
import { newId } from '../crypto';
import * as patients from '../repo/patients';
import { audit } from '../repo/audit';

function input(b: Record<string, unknown>): patients.PatientInput {
  const birth = str(b, 'birthDate', { max: 10, optional: true });
  if (birth && !/^\d{4}-\d{2}-\d{2}$/.test(birth)) throw new ApiError(400, 'invalid', 'birthDate must be YYYY-MM-DD.');
  const email = str(b, 'email', { max: 254, optional: true });
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError(400, 'invalid', 'email is not valid.');
  const country = str(b, 'country', { min: 2, max: 2, optional: true });
  return { fullName: str(b, 'fullName', { max: 160 }), phone: str(b, 'phone', { max: 40 }), email, birthDate: birth, sex: oneOf(b, 'sex', ['female', 'male'] as const, true),
    country: country?.toUpperCase(), city: str(b, 'city', { max: 80, optional: true }), alert: str(b, 'alert', { max: 500, optional: true }), notes: str(b, 'notes', { max: 5000, optional: true }) };
}
const enc = (v: unknown) => btoa(JSON.stringify(v)).replace(/=+$/, '');
function dec(c: string | null): { name: string; id: string } | undefined {
  if (!c) return undefined;
  try { const v = JSON.parse(atob(c)); if (typeof v?.name === 'string' && typeof v?.id === 'string') return v; } catch { /* falls through */ }
  throw new ApiError(400, 'invalid', 'cursor is not valid.');
}

export async function list({ db, url, s }: Ctx) {
  const q = url.searchParams.get('q')?.trim().slice(0, 80);
  const page = await patients.search(db, s.clinicId, { q: q || undefined, archived: url.searchParams.get('archived') === '1', cursor: dec(url.searchParams.get('cursor')), limit: limit(url) });
  return json({ items: page.items, next: page.next ? enc(page.next) : null });
}
export async function read({ db, s, params }: Ctx) {
  const p = await patients.get(db, s.clinicId, id(params[0]));
  if (!p) throw new ApiError(404, 'not_found', 'Patient not found.');
  return json(p);
}
export async function create({ db, req, s }: Ctx) {
  const v = input(await readJson(req)), pid = newId();
  await db.tx(async (t) => { await patients.insert(t, s.clinicId, pid, v); await audit(t, s.clinicId, s.staffId, 'patient.create', 'patient', pid); });
  return json(await patients.get(db, s.clinicId, pid), 201);
}
export async function update({ db, req, s, params }: Ctx) {
  const pid = id(params[0]), b = await readJson(req), version = Number(b['version']);
  if (!Number.isInteger(version)) throw new ApiError(400, 'invalid', 'version is required.');
  const ok = await db.tx(async (t) => { const done = await patients.update(t, s.clinicId, pid, version, input(b)); if (done) await audit(t, s.clinicId, s.staffId, 'patient.update', 'patient', pid); return done; });
  if (!ok) throw new ApiError((await patients.exists(db, s.clinicId, pid)) ? 409 : 404, (await patients.exists(db, s.clinicId, pid)) ? 'conflict' : 'not_found', 'Patient changed or not found.');
  return json(await patients.get(db, s.clinicId, pid));
}
export async function archive({ db, req, s, params }: Ctx) {
  const pid = id(params[0]), on = (await readJson(req))['archived'] === true;
  if (!(await patients.exists(db, s.clinicId, pid))) throw new ApiError(404, 'not_found', 'Patient not found.');
  await db.tx(async (t) => { await patients.setArchived(t, s.clinicId, pid, on); await audit(t, s.clinicId, s.staffId, on ? 'patient.archive' : 'patient.restore', 'patient', pid); });
  return json(await patients.get(db, s.clinicId, pid));
}
