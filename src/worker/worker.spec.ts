// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { handleApi, ROUTES } from './router';
import { hashPassword, newId, verifyPassword, PBKDF2_ITERATIONS } from './crypto';
import { PASSWORD, PEPPER, seed, sqliteDb, testEnv, translate } from './harness';
import { newChart, writeChart } from '../app/denteus/odontogram/engine/chart';

const db = sqliteDb(), env = testEnv();
let w: Awaited<ReturnType<typeof seed>>;
const ORIGIN = 'http://localhost:8787';

interface Opts { cookie?: string; csrf?: string; body?: unknown; form?: { body: Uint8Array; type: string }; headers?: Record<string, string> }
async function call(method: string, path: string, o: Opts = {}): Promise<{ status: number; json: any; res: Response }> {
  const headers: Record<string, string> = { ...(o.cookie ? { cookie: o.cookie } : {}), ...(o.csrf ? { 'x-csrf-token': o.csrf } : {}), ...(o.headers ?? {}) };
  let body: BodyInit | undefined;
  if (o.form) { body = o.form.body as BodyInit; headers['content-type'] = o.form.type; } else if (o.body !== undefined) { body = JSON.stringify(o.body); headers['content-type'] = 'application/json'; }
  const res = (await handleApi(new Request(ORIGIN + path, { method, headers, body }), env, db))!;
  const text = res.headers.get('content-type')?.includes('json') ? await res.clone().json() : null;
  return { status: res.status, json: text, res };
}
const sessions = new Map<string, { cookie: string; csrf: string }>();
async function as(key: string) {
  if (sessions.has(key)) return sessions.get(key)!;
  const r = await call('POST', '/api/v1/auth/login', { body: { email: `${key}@x.test`, password: PASSWORD } });
  expect(r.status).toBe(200);
  const s = { cookie: r.res.headers.get('set-cookie')!.split(';')[0], csrf: r.json.session.csrf as string };
  sessions.set(key, s); return s;
}
const send = async (key: string, method: string, path: string, body?: unknown, extra: Opts = {}) => { const s = await as(key); return call(method, path, { cookie: s.cookie, csrf: s.csrf, body, ...extra }); };
const patientBody = { fullName: 'Amina Test', phone: '0600000000' };
const apptBody = (patientId: string, dentistId: string, chairId: string, h = 9) => ({ patientId, dentistId, chairId, type: 'checkup', start: `2026-12-01T${String(h).padStart(2, '0')}:00:00Z`, end: `2026-12-01T${String(h).padStart(2, '0')}:30:00Z` });

beforeAll(async () => { w = await seed(db); }, 30_000);

describe('crypto', () => {
  it('hashes with a salt, verifies, and rejects a wrong password or pepper', async () => {
    const h = await hashPassword('a long enough password', PEPPER);
    expect(h.startsWith(`pbkdf2$${PBKDF2_ITERATIONS}$`)).toBe(true);
    expect(await verifyPassword('a long enough password', h, PEPPER)).toBe(true);
    expect(await verifyPassword('a long enough passwore', h, PEPPER)).toBe(false);
    expect(await verifyPassword('a long enough password', h, 'other-pepper')).toBe(false);
    expect(h).not.toBe(await hashPassword('a long enough password', PEPPER));
  });
  it('ids sort by creation time', () => { expect(newId(1000) < newId(2000)).toBe(true); });
});

describe('authentication', () => {
  it('login sets an HttpOnly SameSite cookie and never returns the token in the body', async () => {
    const r = await call('POST', '/api/v1/auth/login', { body: { email: 'ownerA@x.test', password: PASSWORD } });
    const c = r.res.headers.get('set-cookie')!;
    expect(r.status).toBe(200); expect(c).toMatch(/HttpOnly/); expect(c).toMatch(/SameSite=Lax/);
    expect(JSON.stringify(r.json)).not.toContain(c.split(';')[0].split('=')[1]);
    expect(r.json.session.role).toBe('owner');
  });
  it('production cookies are Secure and __Host- prefixed', async () => {
    const prod = { ...env, ENVIRONMENT: 'production' };
    const res = (await handleApi(new Request('https://dontalist.com/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ownerA@x.test', password: PASSWORD }) }), prod, db))!;
    const c = res.headers.get('set-cookie')!;
    expect(c).toMatch(/^__Host-dl_session=/); expect(c).toMatch(/Secure/);
  });
  it('wrong password and unknown e-mail give the same answer', async () => {
    const a = await call('POST', '/api/v1/auth/login', { body: { email: 'ownerA@x.test', password: 'wrong wrong wrong' } });
    const b = await call('POST', '/api/v1/auth/login', { body: { email: 'nobody@x.test', password: 'wrong wrong wrong' } });
    expect(a.status).toBe(401); expect(b.status).toBe(401); expect(a.json).toEqual(b.json);
  });
  it('locks the account after 5 failures, even for the right password', async () => {
    for (let i = 0; i < 5; i++) await call('POST', '/api/v1/auth/login', { body: { email: 'assistantA@x.test', password: 'wrong wrong wrong' } });
    expect((await call('POST', '/api/v1/auth/login', { body: { email: 'assistantA@x.test', password: PASSWORD } })).status).toBe(401);
    db.raw.prepare("UPDATE staff SET failed_logins = 0, locked_until = NULL WHERE email_norm = 'assistanta@x.test'").run();
  });
  it('rejects API calls without a session, with a forged cookie, and without the CSRF token', async () => {
    expect((await call('GET', '/api/v1/patients')).status).toBe(401);
    expect((await call('GET', '/api/v1/patients', { cookie: 'dl_session=' + 'a'.repeat(43) })).status).toBe(401);
    const s = await as('ownerA');
    expect((await call('POST', '/api/v1/patients', { cookie: s.cookie, body: patientBody })).status).toBe(403);
    expect((await call('POST', '/api/v1/patients', { cookie: s.cookie, csrf: 'x'.repeat(43), body: patientBody })).json.error.code).toBe('csrf');
    expect((await call('POST', '/api/v1/patients', { cookie: s.cookie, csrf: s.csrf, body: patientBody, headers: { origin: 'https://evil.example' } })).json.error.code).toBe('origin');
  });
  it('suspension takes effect on the very next request and blocks login', async () => {
    const r = await call('POST', '/api/v1/auth/login', { body: { email: 'receptionA@x.test', password: PASSWORD } });
    const cookie = r.res.headers.get('set-cookie')!.split(';')[0];
    expect((await call('GET', '/api/v1/auth/me', { cookie })).status).toBe(200);
    const t = await send('ownerA', 'POST', `/api/v1/team/${w.people['receptionA'].id}/status`, { status: 'suspended', reason: 'on leave' });
    expect(t.status).toBe(200);
    expect((await call('GET', '/api/v1/auth/me', { cookie })).status).toBe(401);
    expect((await call('POST', '/api/v1/auth/login', { body: { email: 'receptionA@x.test', password: PASSWORD } })).json.error.code).toBe('account_suspended');
    await send('ownerA', 'POST', `/api/v1/team/${w.people['receptionA'].id}/status`, { status: 'active' });
  });
  it('permissions are read live: a role change applies without logging in again', async () => {
    const r = await call('POST', '/api/v1/auth/login', { body: { email: 'accountantA@x.test', password: PASSWORD } });
    const cookie = r.res.headers.get('set-cookie')!.split(';')[0];
    expect((await call('GET', '/api/v1/auth/me', { cookie })).json.session.permissions).not.toContain('clinical.view');
    db.raw.prepare("INSERT INTO staff_permission (clinic_id, staff_id, permission, effect) VALUES (?,?,?,?)").run(w.clinics.A, w.people['accountantA'].id, 'clinical.view', 'extra');
    expect((await call('GET', '/api/v1/auth/me', { cookie })).json.session.permissions).toContain('clinical.view');
  });
  it('logout revokes the session; password change revokes the others and needs the current password', async () => {
    const mk = async () => { const r = await call('POST', '/api/v1/auth/login', { body: { email: 'dentistB@x.test', password: PASSWORD } }); return { cookie: r.res.headers.get('set-cookie')!.split(';')[0], csrf: r.json.session.csrf as string }; };
    const one = await mk(), two = await mk();
    expect((await call('POST', '/api/v1/auth/logout', one)).status).toBe(200);
    expect((await call('GET', '/api/v1/auth/me', { cookie: one.cookie })).status).toBe(401);
    expect((await call('POST', '/api/v1/auth/password', { ...two, body: { current: 'not the password', next: 'a brand new password' } })).status).toBe(403);
    expect((await call('POST', '/api/v1/auth/password', { ...two, body: { current: PASSWORD, next: 'short' } })).json.error.code).toBe('weak_password');
    const three = await mk();
    expect((await call('POST', '/api/v1/auth/password', { ...two, body: { current: PASSWORD, next: 'a brand new password' } })).status).toBe(200);
    expect((await call('GET', '/api/v1/auth/me', { cookie: two.cookie })).status).toBe(200);
    expect((await call('GET', '/api/v1/auth/me', { cookie: three.cookie })).status).toBe(401);
    expect((await call('POST', '/api/v1/auth/login', { body: { email: 'dentistB@x.test', password: 'a brand new password' } })).status).toBe(200);
  });
  it('a reset link works once, expires, and revokes sessions', async () => {
    const issued = await send('ownerA', 'POST', `/api/v1/team/${w.people['dentistA'].id}/reset`);
    expect(issued.status).toBe(201);
    const token = issued.json.token as string;
    expect((await call('POST', '/api/v1/auth/reset', { body: { token, password: 'another long password' } })).status).toBe(200);
    expect((await call('POST', '/api/v1/auth/reset', { body: { token, password: 'yet another long password' } })).json.error.code).toBe('invalid_token');
    const old = await call('POST', '/api/v1/auth/login', { body: { email: 'dentistA@x.test', password: PASSWORD } });
    expect(old.status).toBe(401);
    const fresh = await call('POST', '/api/v1/auth/login', { body: { email: 'dentistA@x.test', password: 'another long password' } });
    sessions.delete('dentistA');
    db.raw.prepare('UPDATE staff SET password_hash = (SELECT password_hash FROM staff WHERE email_norm = ?) WHERE email_norm = ?').run('ownera@x.test', 'dentista@x.test');
    expect(fresh.status).toBe(200);
  });
  it('only an active owner can be the last one: an owner cannot suspend themselves', async () => {
    expect((await send('ownerA', 'POST', `/api/v1/team/${w.people['ownerA'].id}/status`, { status: 'suspended', reason: 'oops oops' })).json.error.code).toBe('self');
  });
  it('an admin-level person cannot manage an owner', async () => {
    // reception has no team.manage at all: 403 from the permission check
    expect((await send('receptionA', 'POST', `/api/v1/team/${w.people['ownerA'].id}/status`, { status: 'suspended', reason: 'nope nope' })).status).toBe(403);
  });
});

describe('clinic isolation', () => {
  let pA: string, apptA: string;
  beforeAll(async () => {
    pA = (await send('ownerA', 'POST', '/api/v1/patients', patientBody)).json.id;
    apptA = (await send('receptionA', 'POST', '/api/v1/appointments', apptBody(pA, w.people['dentistA'].id, w.chairA))).json.id;
  });
  it('a clinic never sees another clinic’s patients, by id, search or list', async () => {
    expect((await send('ownerB', 'GET', `/api/v1/patients/${pA}`)).status).toBe(404);
    expect((await send('ownerB', 'GET', '/api/v1/patients?q=Amina')).json.items).toHaveLength(0);
    expect((await send('ownerB', 'PUT', `/api/v1/patients/${pA}`, { ...patientBody, fullName: 'Hacked', version: 1 })).status).toBe(404);
    expect((await send('ownerA', 'GET', `/api/v1/patients/${pA}`)).json.fullName).toBe('Amina Test');
  });
  it('rejects related records from another clinic (patient, dentist, chair)', async () => {
    const pB = (await send('ownerB', 'POST', '/api/v1/patients', patientBody)).json.id;
    expect((await send('receptionA', 'POST', '/api/v1/appointments', apptBody(pB, w.people['dentistA'].id, w.chairA, 11))).json.error.code).toBe('unknown_patient');
    expect((await send('receptionA', 'POST', '/api/v1/appointments', apptBody(pA, w.people['dentistB'].id, w.chairA, 11))).json.error.code).toBe('unknown_dentist');
    expect((await send('receptionA', 'POST', '/api/v1/appointments', apptBody(pA, w.people['dentistA'].id, w.chairB, 11))).json.error.code).toBe('unknown_chair');
  });
  it('appointments, examinations, files, audit and team are clinic-scoped too', async () => {
    expect((await send('ownerB', 'GET', `/api/v1/appointments/${apptA}`)).status).toBe(404);
    expect((await send('ownerB', 'GET', '/api/v1/appointments?from=2026-12-01T00:00:00Z&to=2026-12-02T00:00:00Z')).json.items).toHaveLength(0);
    expect((await send('ownerB', 'GET', `/api/v1/patients/${pA}/examinations`)).status).toBe(404);
    expect((await send('ownerB', 'GET', '/api/v1/team')).json.items.map((x: any) => x.name).sort()).toEqual(['dentistB', 'ownerB']);
    const audit = (await send('ownerB', 'GET', '/api/v1/audit')).json.items;
    expect(audit.every((e: any) => e.entityId !== pA)).toBe(true);
    expect((await send('ownerB', 'POST', `/api/v1/team/${w.people['dentistA'].id}/status`, { status: 'suspended', reason: 'cross clinic' })).status).toBe(404);
  });
  it('a client-supplied clinic id is ignored', async () => {
    const r = await send('ownerB', 'POST', '/api/v1/patients', { ...patientBody, fullName: 'Spoof', clinicId: w.clinics.A, clinic_id: w.clinics.A });
    expect(r.status).toBe(201);
    expect((await send('ownerA', 'GET', '/api/v1/patients?q=Spoof')).json.items).toHaveLength(0);
  });
  it('the composite foreign keys refuse a cross-clinic row even if the code were wrong', () => {
    expect(() => db.raw.prepare("INSERT INTO appointment (id, clinic_id, patient_id, dentist_id, chair_id, type, start_at, end_at, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .run(newId(), w.clinics.B, pA, w.people['dentistB'].id, w.chairB, 'checkup', '2026-12-05 09:00:00.000', '2026-12-05 09:30:00.000', w.people['ownerB'].id, 'x', 'x')).toThrow(/FOREIGN KEY/);
  });
});

describe('permissions on the server', () => {
  it('every role gets the answer the permission table gives', async () => {
    const list = (k: string) => send(k, 'GET', '/api/v1/patients');
    for (const k of ['ownerA', 'dentistA', 'receptionA', 'assistantA', 'accountantA']) expect((await list(k)).status).toBe(200);
    expect((await send('receptionA', 'POST', '/api/v1/patients', patientBody)).status).toBe(201);
    expect((await send('assistantA', 'POST', '/api/v1/patients', patientBody)).status).toBe(403);
    expect((await send('accountantA', 'POST', '/api/v1/appointments', {})).status).toBe(403);
    expect((await send('dentistA', 'GET', '/api/v1/team')).status).toBe(403);
    expect((await send('dentistA', 'GET', '/api/v1/audit')).status).toBe(403);
    expect((await send('receptionA', 'GET', '/api/v1/team')).status).toBe(403);
  });
  it('every route declares who may call it; unknown paths 404 and wrong methods 405', async () => {
    expect(ROUTES.every((r) => typeof r.access === 'string')).toBe(true);
    expect(ROUTES.filter((r) => r.access === 'public').map((r) => r.re.source)).toHaveLength(2);
    expect((await call('GET', '/api/v1/nothing')).status).toBe(404);
    expect((await call('DELETE', '/api/v1/auth/login')).status).toBe(405);
    expect((await call('GET', '/api/v2/patients')).status).toBe(404);
  });
});

describe('appointments', () => {
  let p: string;
  beforeAll(async () => { p = (await send('ownerA', 'POST', '/api/v1/patients', { ...patientBody, fullName: 'Appt Person' })).json.id; });
  it('refuses double booking of a dentist or a chair', async () => {
    const a = await send('receptionA', 'POST', '/api/v1/appointments', apptBody(p, w.people['dentistA'].id, w.chairA, 14));
    expect(a.status).toBe(201);
    expect((await send('receptionA', 'POST', '/api/v1/appointments', apptBody(p, w.people['dentistA'].id, w.chairA, 14))).json.error.code).toBe('overlap');
  });
  it('validates input and bounds list ranges', async () => {
    expect((await send('receptionA', 'POST', '/api/v1/appointments', { ...apptBody(p, w.people['dentistA'].id, w.chairA, 15), end: '2026-12-01T10:00:00Z' })).status).toBe(400);
    expect((await send('receptionA', 'GET', '/api/v1/appointments?from=2026-01-01T00:00:00Z&to=2026-12-31T00:00:00Z')).status).toBe(400);
    expect((await send('receptionA', 'GET', '/api/v1/appointments')).status).toBe(400);
  });
  it('follows the status flow and keeps a history; a stale edit loses', async () => {
    const a = (await send('receptionA', 'POST', '/api/v1/appointments', apptBody(p, w.people['dentistA'].id, w.chairA, 16))).json;
    expect((await send('receptionA', 'POST', `/api/v1/appointments/${a.id}/status`, { status: 'completed' })).json.error.code).toBe('bad_transition');
    expect((await send('receptionA', 'POST', `/api/v1/appointments/${a.id}/status`, { status: 'arrived' })).json.status).toBe('arrived');
    const stale = await send('receptionA', 'PUT', `/api/v1/appointments/${a.id}`, { ...apptBody(p, w.people['dentistA'].id, w.chairA, 17), version: a.version });
    expect(stale.json.error.code).toBe('conflict');
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM appointment_status_change WHERE appointment_id = ?').get(a.id)).toEqual({ n: 2 });
  });
});

describe('examinations: integrity', () => {
  let p: string;
  const chart = () => writeChart(newChart());
  beforeAll(async () => { p = (await send('ownerA', 'POST', '/api/v1/patients', { ...patientBody, fullName: 'Exam Person' })).json.id; });
  it('only clinical roles may write; only approvers may sign; only void-capable roles may void', async () => {
    expect((await send('receptionA', 'POST', `/api/v1/patients/${p}/examinations`, { chart: chart() })).status).toBe(403);
    const e = (await send('assistantA', 'POST', `/api/v1/patients/${p}/examinations`, { chart: chart() })).json;
    expect(e.status).toBe('draft');
    expect((await send('assistantA', 'POST', `/api/v1/examinations/${e.id}/sign`)).status).toBe(403);
    expect((await send('dentistA', 'POST', `/api/v1/examinations/${e.id}/sign`)).json.status).toBe('signed');
    expect((await send('assistantA', 'POST', `/api/v1/examinations/${e.id}/void`, { reason: 'wrong patient' })).status).toBe(403);
  });
  it('a signed examination cannot be edited; a correction is a new record that points back', async () => {
    const e = (await send('dentistA', 'POST', `/api/v1/patients/${p}/examinations`, { chart: chart(), note: 'first' })).json;
    expect((await send('dentistA', 'PUT', `/api/v1/examinations/${e.id}`, { chart: chart(), note: 'edited draft' })).status).toBe(200);
    await send('dentistA', 'POST', `/api/v1/examinations/${e.id}/sign`);
    expect((await send('dentistA', 'PUT', `/api/v1/examinations/${e.id}`, { chart: chart(), note: 'sneaky' })).json.error.code).toBe('immutable');
    expect((await send('dentistA', 'POST', `/api/v1/examinations/${e.id}/sign`)).json.error.code).toBe('immutable');
    const c = await send('dentistA', 'POST', `/api/v1/examinations/${e.id}/correct`);
    expect(c.status).toBe(201); expect(c.json.supersedesId).toBe(e.id); expect(c.json.status).toBe('draft');
    expect((await send('dentistA', 'POST', `/api/v1/examinations/${e.id}/correct`)).json.error.code).toBe('already_corrected');
    const original = (await send('dentistA', 'GET', `/api/v1/examinations/${e.id}`)).json;
    expect(original.note).toBe('edited draft'); expect(original.status).toBe('signed'); expect(original.supersededBy).toBe(c.json.id);
  });
  it('voiding needs a reason, keeps the row, and cannot be repeated', async () => {
    const e = (await send('dentistA', 'POST', `/api/v1/patients/${p}/examinations`, { chart: chart() })).json;
    await send('dentistA', 'POST', `/api/v1/examinations/${e.id}/sign`);
    expect((await send('dentistA', 'POST', `/api/v1/examinations/${e.id}/void`, {})).status).toBe(400);
    const v = await send('dentistA', 'POST', `/api/v1/examinations/${e.id}/void`, { reason: 'entered on the wrong patient' });
    expect(v.json.status).toBe('void'); expect(v.json.voidReason).toContain('wrong patient');
    expect((await send('dentistA', 'POST', `/api/v1/examinations/${e.id}/void`, { reason: 'again again' })).status).toBe(409);
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM examination WHERE id = ?').get(e.id)).toEqual({ n: 1 });
  });
  it('refuses an unreadable chart and one the engine would change lossily', async () => {
    expect((await send('dentistA', 'POST', `/api/v1/patients/${p}/examinations`, { chart: { nope: 1 } })).json.error.code).toBe('bad_chart');
    const bad = JSON.parse(JSON.stringify(chart())); bad.teeth['11'].caries = 'not-a-real-value';
    const r = await send('dentistA', 'POST', `/api/v1/patients/${p}/examinations`, { chart: bad });
    expect(r.status).toBe(422); expect(r.json.error.code).toBe('lossy_chart');
  });
  it('writes audit events for each clinical action', async () => {
    const actions = (db.raw.prepare("SELECT DISTINCT action FROM audit_event WHERE clinic_id = ?").all(w.clinics.A) as any[]).map((r) => r.action);
    for (const a of ['exam.create', 'exam.sign', 'exam.void', 'exam.correct', 'auth.login', 'staff.suspended']) expect(actions).toContain(a);
  });
});

describe('files (R2)', () => {
  let p: string;
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  const upload = (key: string, bytes: Uint8Array, type: string, kind = 'xray', name = 'scan.png', patientId: string | undefined = p) => {
    // Built by hand: the jsdom test environment's FormData is not the one the Workers/undici Request understands.
    const b = '----t' + Math.random().toString(16).slice(2), enc = new TextEncoder(), parts: Uint8Array[] = [];
    const field = (n: string, v: string) => parts.push(enc.encode(`--${b}\r\nContent-Disposition: form-data; name="${n}"\r\n\r\n${v}\r\n`));
    field('kind', kind); if (patientId) field('patientId', patientId);
    parts.push(enc.encode(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n`), bytes, enc.encode(`\r\n--${b}--\r\n`));
    const all = new Uint8Array(parts.reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of parts) { all.set(x, o); o += x.length; }
    return send(key, 'POST', '/api/v1/files', undefined, { form: { body: all, type: `multipart/form-data; boundary=${b}` } });
  };
  beforeAll(async () => { p = (await send('ownerA', 'POST', '/api/v1/patients', { ...patientBody, fullName: 'File Person' })).json.id; });
  it('stores bytes in R2 under an unguessable key and metadata in the database; the key is never returned', async () => {
    const r = await upload('dentistA', png, 'image/png');
    expect(r.status).toBe(201);
    expect(JSON.stringify(r.json)).not.toContain('r2Key');
    const keys = [...(env.FILES as any).store.keys()] as string[];
    expect(keys).toHaveLength(1); expect(keys[0]).toMatch(new RegExp(`^c/${w.clinics.A}/[A-Za-z0-9_-]{32}\\.png$`));
    expect(r.json.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it('rejects wrong type, content that is not what it says, oversize and unknown patient', async () => {
    expect((await upload('dentistA', png, 'image/svg+xml')).status).toBe(415);
    expect((await upload('dentistA', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), 'image/png')).json.error.code).toBe('type_mismatch');
    expect((await upload('dentistA', png, 'image/png', 'pdf')).status).toBe(415);
    const big = new Uint8Array(10 * 1024 * 1024 + 1); big.set(png);
    expect((await upload('dentistA', big, 'image/png')).status).toBe(413);
    expect((await upload('dentistA', png, 'image/png', 'xray', 'x.png', newId())).json.error.code).toBe('unknown_patient');
  });
  it('downloads need clinical.view and the same clinic; headers prevent sniffing and caching', async () => {
    const up = (await upload('dentistA', png, 'image/png', 'photo', '../../etc/passwd.png')).json;
    expect(up.filename).not.toContain('/');
    const ok = await send('dentistA', 'GET', `/api/v1/files/${up.id}/content`);
    expect(ok.status).toBe(200);
    expect(new Uint8Array(await ok.res.arrayBuffer())).toEqual(png);
    expect(ok.res.headers.get('x-content-type-options')).toBe('nosniff'); expect(ok.res.headers.get('cache-control')).toContain('no-store');
    expect((await send('ownerB', 'GET', `/api/v1/files/${up.id}/content`)).status).toBe(404);
    expect((await send('ownerB', 'GET', `/api/v1/files/${up.id}`)).status).toBe(404);
    expect((await send('receptionA', 'GET', `/api/v1/files/${up.id}/content`)).status).toBe(403);
    expect((await send('ownerB', 'DELETE', `/api/v1/files/${up.id}`)).status).toBe(404);
  });
  it('delete is a soft delete the audit trail can still resolve', async () => {
    const up = (await upload('dentistA', png, 'image/png')).json;
    expect((await send('assistantA', 'DELETE', `/api/v1/files/${up.id}`)).status).toBe(403);
    expect((await send('dentistA', 'DELETE', `/api/v1/files/${up.id}`)).status).toBe(200);
    expect((await send('dentistA', 'GET', `/api/v1/files/${up.id}`)).status).toBe(404);
    expect(db.raw.prepare('SELECT deleted_by FROM file_object WHERE id = ?').get(up.id)).toEqual({ deleted_by: w.people['dentistA'].id });
  });
});

describe('structure', () => {
  it('the audit table is only ever inserted into or read from by application code', () => {
    const offenders = ['repo', 'services', 'api'].flatMap((d) => readdirSync(`src/worker/${d}`).map((f) => `src/worker/${d}/${f}`))
      .filter((f) => /(UPDATE|DELETE FROM)\s+audit_event/i.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
  it('every query on a clinic-owned table is scoped by clinic_id (login and token lookups excepted)', () => {
    const TOKEN_LOOKUPS = /password_reset|auth_session s|FROM staff t JOIN clinic c ON c.id = t.clinic_id WHERE t.email_norm|UPDATE staff SET failed_logins|UPDATE auth_session SET last_seen|clinic_public_profile|SELECT 1 AS ok\b(?! FROM)|UPDATE auth_session SET revoked_at = \?, revoked_reason = \? WHERE token_hash/;
    const bad: string[] = [];
    for (const f of readdirSync('src/worker/repo')) {
      const text = readFileSync(`src/worker/repo/${f}`, 'utf8');
      for (const m of text.matchAll(/(['`])((?:SELECT|UPDATE|DELETE)\b(?:(?!\1)[\s\S])*)\1/g)) {
        const sql = m[2];
        if (!/\b(FROM|UPDATE)\s+(patient|appointment|examination|file_object|staff|chair|audit_event|auth_session)\b/.test(sql)) continue;
        if (!/clinic_id/.test(sql) && !/\$\{where/.test(sql) && !TOKEN_LOOKUPS.test(sql)) bad.push(`${f}: ${sql.slice(0, 90)}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('no SELECT * and no unbounded list query', () => {
    for (const f of readdirSync('src/worker/repo')) {
      const text = readFileSync(`src/worker/repo/${f}`, 'utf8');
      expect(text).not.toMatch(/SELECT\s+\*/);
    }
  });
  it('the migration avoids what TiDB lacks: triggers, procedures, events, and keeps utf8mb4', () => {
    const sql = readFileSync('db/migrations/0001_core.sql', 'utf8').replace(/--.*$/gm, '');
    expect(sql).not.toMatch(/CREATE\s+(TRIGGER|PROCEDURE|EVENT|FUNCTION)/i);
    expect(sql).not.toMatch(/\bCHECK\s*\(/i);
    expect((sql.match(/CREATE TABLE/g) ?? []).length).toBe(translate(readFileSync('db/migrations/0001_core.sql', 'utf8')).length);
  });
  it('SSR context type carries no secret binding', () => {
    expect(readFileSync('src/worker/env.ts', 'utf8')).toMatch(/interface SsrContext \{ session: SessionView \| null; origin: string; loadClinics/);
  });
});
