import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_CONFIG } from '../../core/api/api-config';
import { apiInterceptor } from '../../core/api/api.interceptor';
import { AuthService } from '../../core/auth/auth.service';
import { ApiSession } from '../../core/api/api-session.service';
import { ClinicDatabase } from './clinic-database.service';
import { DentalStore } from './dental-store.service';

const API = 'https://api.example.test/v1/patients';

describe('DentalStore patients in server mode (unit, mock HTTP)', () => {
  let store: DentalStore, ctl: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: API_CONFIG, useValue: { url: 'https://api.example.test' } }, provideHttpClient(withInterceptors([apiInterceptor])), provideHttpClientTesting()] });
    vi.spyOn(TestBed.inject(AuthService), 'can').mockReturnValue(true);
    store = TestBed.inject(DentalStore); ctl = TestBed.inject(HttpTestingController);
  });
  afterEach(() => ctl.verify());
  const tick = () => new Promise((r) => setTimeout(r));

  it('uses the server for patients, and asks for one page only', async () => {
    expect(store.server).toBe(true);
    const p = store.loadPatients({ q: 'ann' });
    ctl.expectOne((r) => r.url === API && r.params.get('q') === 'ann').flush({ items: [{ id: 'a', fullName: 'Ann', phone: '06', number: 'P-0001' }], nextCursor: 'n' });
    expect((await p).nextCursor).toBe('n');
    expect(store.patients().map((x) => x.id)).toEqual(['a']);
  });

  it('adds with the id and number the server assigns, and does not add when the server refuses', async () => {
    const ok = store.addPatient({ fullName: ' Ann ', phone: '06' });
    const req = ctl.expectOne(API); expect(req.request.body.fullName).toBe('Ann'); req.flush({ id: 'id1', number: 'P-0007' });
    expect(await ok).toMatchObject({ id: 'id1', number: 'P-0007', fullName: 'Ann' });
    const bad = store.addPatient({ fullName: 'Bob', phone: '' }); const rejected = expect(bad).rejects.toBeTruthy();
    ctl.expectOne(API).flush({ error: { message: 'no' } }, { status: 400, statusText: 'Bad Request' });
    await rejected;
    expect(store.patients().map((x) => x.id)).toEqual(['id1']);
  });

  it('edits on the server first and keeps the cache unchanged when that fails', async () => {
    const add = store.addPatient({ fullName: 'Ann', phone: '06' }); ctl.expectOne(API).flush({ id: 'a', number: 'P-1' }); await add;
    const fail = expect(store.updatePatient('a', { fullName: 'Ann B', phone: '06' })).rejects.toBeTruthy();
    ctl.expectOne(`${API}/a`).flush({}, { status: 409, statusText: 'Conflict' }); await fail;
    expect(store.patientMap().get('a')?.fullName).toBe('Ann');
    const ok = store.updatePatient('a', { fullName: 'Ann B', phone: '06' }); ctl.expectOne(`${API}/a`).flush(null);
    expect((await ok)?.fullName).toBe('Ann B');
  });

  it('archives and restores through the server, then updates the cache', async () => {
    const add = store.addPatient({ fullName: 'Ann', phone: '06' }); ctl.expectOne(API).flush({ id: 'a', number: 'P-1' }); await add;
    const a = store.setArchived('a', true); ctl.expectOne(`${API}/a/archive`).flush(null); await a;
    expect(store.patientMap().get('a')?.archivedAt).toBeTruthy();
    const r = store.setArchived('a', false); ctl.expectOne(`${API}/a/unarchive`).flush(null); await r;
    expect(store.patientMap().get('a')?.archivedAt).toBeUndefined();
  });

  it('merges on the server, then drops the duplicate from the cache and re-reads the kept file', async () => {
    store.patients.set([{ id: 'keep', fullName: 'Ann', phone: '1' }, { id: 'drop', fullName: 'Ann', phone: '1' }]);
    const m = store.mergePatients('keep', 'drop');
    ctl.expectOne(`${API}/drop/merge`).flush(null); await tick();
    ctl.expectOne(`${API}/keep`).flush({ id: 'keep', fullName: 'Ann', phone: '1', notes: 'Merged' });
    expect(await m).toBe(true);
    expect(store.patients()).toEqual([{ id: 'keep', fullName: 'Ann', phone: '1', notes: 'Merged' }]);
  });

  it('keeps both files when the server refuses a merge', async () => {
    store.patients.set([{ id: 'keep', fullName: 'Ann', phone: '1' }, { id: 'drop', fullName: 'Ann', phone: '1' }]);
    const m = expect(store.mergePatients('keep', 'drop')).rejects.toBeTruthy();
    ctl.expectOne(`${API}/drop/merge`).flush({ error: { message: 'blocked' } }, { status: 409, statusText: 'Conflict' }); await m;
    expect(store.patients()).toHaveLength(2);
  });

  it('opens a profile that is not cached by fetching that one record; a missing one reports false', async () => {
    const ok = store.ensurePatient('x'); ctl.expectOne(`${API}/x`).flush({ id: 'x', fullName: 'X', phone: null }); expect(await ok).toBe(true);
    expect(store.patientMap().get('x')?.fullName).toBe('X');
    expect(await store.ensurePatient('x')).toBe(true); // cached: no second request
    const gone = store.ensurePatient('y'); ctl.expectOne(`${API}/y`).flush({}, { status: 404, statusText: 'Not Found' }); expect(await gone).toBe(false);
  });
});

describe('DentalStore clinic and appointments in server mode (unit, mock HTTP)', () => {
  const ROOT = 'https://api.example.test/v1';
  let store: DentalStore, ctl: HttpTestingController;
  const ME = { id: 's', clinicId: 'clinic-1', name: 'Dr Amal', role: 'owner', permissions: ['appointments.create', 'appointments.edit', 'settings.edit', 'profile.edit', 'patients.manage'] };
  const tick = () => new Promise((r) => setTimeout(r));
  const iso = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 24, h, m)).toISOString();

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [
      { provide: API_CONFIG, useValue: { url: 'https://api.example.test' } }, provideHttpClient(withInterceptors([apiInterceptor])), provideHttpClientTesting(),
      { provide: ClinicDatabase, useValue: { loadSetting: async () => null, saveSetting: async () => undefined } },
    ] });
    ctl = TestBed.inject(HttpTestingController);
    const session = TestBed.inject(ApiSession);
    const signedIn = session.refresh(); ctl.expectOne(`${ROOT}/auth/me`).flush(ME); await signedIn;
    store = TestBed.inject(DentalStore);
    const loading = store.init();
    await tick();
    ctl.expectOne(`${ROOT}/clinic`).flush({ name: 'Smile', timezone: 'Africa/Casablanca', currency: 'MAD', settings: { city: 'Rabat', phone: '0537' }, version: 3 });
    ctl.expectOne(`${ROOT}/clinic/profile`).flush({ profile: { state: 'published', slug: 'smile' }, version: 2 });
    ctl.expectOne((r) => r.url === `${ROOT}/clinic/closures`).flush({ items: [{ id: 'cl1', from: '2026-12-25', to: '2026-12-25', reason: 'Holiday' }] });
    ctl.expectOne(`${ROOT}/dentists`).flush({ items: [{ id: 'd1', name: 'Dr A', specialty: null, color: null, phone: null }] });
    ctl.expectOne(`${ROOT}/chairs`).flush({ items: [{ id: 'c1', name: 'Chair 1', color: null }] });
    await loading;
    TestBed.inject(AuthService); vi.spyOn(TestBed.inject(AuthService), 'can').mockReturnValue(true);
  });
  afterEach(() => ctl.verify());

  it('builds the one clinic from the server documents and keeps nothing in the browser', () => {
    const l = store.locations()[0];
    expect(l).toMatchObject({ id: 'clinic-1', name: 'Smile', timezone: 'Africa/Casablanca', currency: 'MAD', city: 'Rabat', code: 'MAIN' });
    expect(l.profile).toMatchObject({ state: 'published', slug: 'smile', closures: [{ from: '2026-12-25', to: '2026-12-25', reason: 'Holiday' }] });
    expect(store.dentists()).toEqual([{ id: 'd1', name: 'Dr A', specialty: '', color: '#2563eb' }]);
    expect(store.chairs()).toEqual([{ id: 'c1', name: 'Chair 1' }]);
    expect(store.patients()).toEqual([]); expect(store.appointments()).toEqual([]); expect(store.loaded()).toBe(true);
  });

  it('saves settings with the version it read, then the profile and closures; a refused save keeps the screen as it was', async () => {
    const before = store.locations();
    const bad = expect(store.saveLocations([{ ...before[0], phone: '0600' }])).rejects.toBeTruthy();
    const put = ctl.expectOne(`${ROOT}/clinic`); expect(put.request.method).toBe('PUT'); expect(put.request.body.expectedVersion).toBe(3); expect(put.request.body.settings.phone).toBe('0600');
    put.flush({ error: { code: 'stale', message: 'changed' } }, { status: 409, statusText: 'Conflict' }); await bad;
    expect(store.locations()).toBe(before);

    const next = { ...before[0], phone: '0600', profile: { ...before[0].profile!, intro: 'Hi', closures: [{ from: '2026-12-31', to: '2026-12-31' }] } };
    const ok = store.saveLocations([next]);
    ctl.expectOne(`${ROOT}/clinic`).flush({ version: 4 }); await tick();
    const prof = ctl.expectOne(`${ROOT}/clinic/profile`); expect(prof.request.body.expectedVersion).toBe(2); expect(prof.request.body.profile).not.toHaveProperty('closures'); prof.flush({ version: 3 }); await tick();
    ctl.expectOne(`${ROOT}/clinic/closures/cl1`).flush(null); await tick();
    const added = ctl.expectOne(`${ROOT}/clinic/closures`); expect(added.request.body).toEqual({ from: '2026-12-31', to: '2026-12-31' }); added.flush({ id: 'cl2' });
    await ok; expect(store.locations()[0].phone).toBe('0600');
  });

  it('creates new dentists (taking the server id), edits changed ones and archives removed ones', async () => {
    const done = store.saveResources([{ id: 'd1', name: 'Dr A', specialty: 'Ortho', color: '#2563eb' }, { id: 'tmp', name: 'Dr New', specialty: '', color: '#111111' }], []);
    await tick();
    const patch = ctl.expectOne(`${ROOT}/dentists/d1`); expect(patch.request.method).toBe('PATCH'); expect(patch.request.body.specialty).toBe('Ortho'); patch.flush(null); await tick();
    ctl.expectOne(`${ROOT}/dentists`).flush({ id: 'srv-2' }); await tick();
    ctl.expectOne(`${ROOT}/chairs/c1/archive`).flush(null); await done;
    expect(store.dentists().map((d) => d.id)).toEqual(['d1', 'srv-2']); expect(store.chairs()).toEqual([]);
  });

  it('loads only the dates asked for and replaces that window (a cancelled visit disappears)', async () => {
    const apptDto = (id: string, h: number) => ({ id, patientId: 'p1', dentistId: 'd1', chairId: 'c1', type: 'checkup', status: 'scheduled', startAt: iso(h), endAt: iso(h, 30), version: 1 });
    const first = store.loadAppointments(new Date(iso(0)), new Date(iso(23)));
    const r = ctl.expectOne((x) => x.url === `${ROOT}/appointments`); expect(r.request.params.get('limit')).toBe('100'); r.flush({ items: [apptDto('a1', 9), apptDto('a2', 10)], nextCursor: null }); await first;
    expect(store.appointments().map((a) => a.id)).toEqual(['a1', 'a2']);
    const again = store.loadAppointments(new Date(iso(0)), new Date(iso(23)));
    ctl.expectOne((x) => x.url === `${ROOT}/appointments`).flush({ items: [apptDto('a1', 9)], nextCursor: null }); await again;
    expect(store.appointments().map((a) => a.id)).toEqual(['a1']);
  });

  const seed = () => store.appointments.set([{ id: 'a1', patientId: 'p1', dentistId: 'd1', chairId: 'c1', type: 'checkup', status: 'scheduled', start: new Date(iso(9)), end: new Date(iso(9, 30)), version: 4, createdAt: new Date(), createdBy: '', history: [], scheduleHistory: [] }]);

  it('books through the server; a taken slot comes back as a conflict and nothing is added', async () => {
    store.patients.set([{ id: 'p1', fullName: 'Ann', phone: '1' }]);
    const draft = { patientId: 'p1', dentistId: 'd1', chairId: 'c1', type: 'checkup' as const, status: 'scheduled' as const, start: new Date(Date.now() + 7 * 864e5 + 3 * 36e5 - ((Date.now() + 7 * 864e5 + 3 * 36e5) % 3e5)), durationMin: 30, reason: '', note: '' };
    const lost = store.createAppointment(draft); await tick();
    ctl.expectOne(`${ROOT}/appointments`).flush({ error: { code: 'slot_taken', message: 'That time is no longer free' } }, { status: 409, statusText: 'Conflict' });
    const r = await lost; expect(r.ok).toBe(false); if (!r.ok) { expect(r.code).toBe('conflict'); expect(r.message).toBe('That time is no longer free'); }
    expect(store.appointments()).toEqual([]);
    const won = store.createAppointment(draft); await tick();
    ctl.expectOne(`${ROOT}/appointments`).flush({ id: 'new1' }, { status: 201, statusText: 'Created' });
    const ok = await won; expect(ok.ok && ok.value).toMatchObject({ id: 'new1', version: 1 });
  });

  it('moves with the version it holds and keeps the new one; a stale version is a conflict and nothing moves', async () => {
    seed();
    const stale = store.reschedule('a1', { start: new Date(iso(11)), end: new Date(iso(11, 30)) }); await tick();
    const req = ctl.expectOne(`${ROOT}/appointments/a1/reschedule`); expect(req.request.body).toMatchObject({ version: 4, dentistId: 'd1', chairId: 'c1' });
    req.flush({ error: { code: 'stale', message: 'The appointment changed' } }, { status: 409, statusText: 'Conflict' });
    expect((await stale).ok).toBe(false); expect(store.appointments()[0].start.toISOString()).toBe(iso(9));
    const ok = store.reschedule('a1', { start: new Date(iso(11)), end: new Date(iso(11, 30)) }); await tick();
    ctl.expectOne(`${ROOT}/appointments/a1/reschedule`).flush({ version: 5 });
    expect((await ok).ok).toBe(true); expect(store.appointments()[0]).toMatchObject({ version: 5 }); expect(store.appointments()[0].start.toISOString()).toBe(iso(11));
  });

  it('changes status through the server and edits reason/note without moving', async () => {
    seed();
    const t = store.transition('a1', 'confirmed'); await tick();
    const s = ctl.expectOne(`${ROOT}/appointments/a1/status`); expect(s.request.body).toEqual({ status: 'confirmed', version: 4 }); s.flush({ version: 5 });
    expect((await t).ok).toBe(true); expect(store.appointments()[0]).toMatchObject({ status: 'confirmed', version: 5 });
    const e = store.updateAppointment('a1', { id: 'a1', patientId: 'p1', dentistId: 'd1', chairId: 'c1', type: 'checkup', status: 'confirmed', start: new Date(iso(9)), durationMin: 30, reason: 'pain', note: '' }); await tick();
    const p = ctl.expectOne(`${ROOT}/appointments/a1`); expect(p.request.method).toBe('PATCH'); expect(p.request.body).toMatchObject({ version: 5, reason: 'pain' }); p.flush({ version: 6 });
    expect((await e).ok).toBe(true); expect(store.appointments()[0]).toMatchObject({ reason: 'pain', version: 6 });
  });

  it('puts a patient on and off the waiting list through the server, and reads the list as the server has it', async () => {
    store.patients.set([{ id: 'p1', fullName: 'Ann', phone: '1' }]);
    const on = store.setWaiting('p1', true); ctl.expectOne(`${ROOT}/patients/p1/waiting`).flush(null); await on;
    expect(store.patientMap().get('p1')?.waiting?.since).toBeTruthy();
    const load = store.loadWaiting(); const r = ctl.expectOne((x) => x.url === `${ROOT}/waiting`); expect(r.request.params.get('limit')).toBe('100');
    r.flush({ items: [{ patientId: 'p2', number: 'P-2', fullName: 'Bo', since: '2026-11-24T08:00:00.000Z' }], nextCursor: null }); await load;
    expect(store.patientMap().get('p1')?.waiting).toBeUndefined(); expect(store.patientMap().get('p2')?.waiting?.since).toBe('2026-11-24T08:00:00.000Z');
    const off = store.setWaiting('p2', false); ctl.expectOne(`${ROOT}/patients/p2/waiting`).flush(null); await off;
    expect(store.patientMap().get('p2')?.waiting).toBeUndefined();
  });

  /* ---- S4: clinical sections of one patient file ---- */
  const P = `${ROOT}/patients/p1`;
  const chartDto = { version: '2.22', globals: { a: true }, teeth: { '11': { status: 'ok' } } };
  const revsDto = { teeth: { '11': 2 }, plan: {}, globals: 1, case: 0 };
  const openFile = async (opts: { chart?: boolean; exams?: unknown[] } = {}) => {
    store.patients.set([{ id: 'p1', fullName: 'Ann', phone: '1' }]);
    const loading = store.loadPatientFile('p1'); await tick();
    ctl.expectOne(`${P}/medical`).flush({ conditions: ['asthma'], allergies: 'penicillin', medications: '', legacyMatched: ['x'], version: 5 });
    ctl.expectOne(`${P}/chart`).flush(opts.chart === false ? { chart: null } : { chart: chartDto, revs: revsDto });
    ctl.expectOne((r) => r.url === `${P}/plan`).flush({ items: [{ id: 'i1', procedure: 'filling', price: '300.00', status: 'planned', tooth: '11', currency: 'MAD' }], nextCursor: null });
    const ex = ctl.match((r) => r.url === `${P}/exams`);
    expect(ex.map((r) => r.request.params.get('order')).sort()).toEqual(['asc', 'desc']);
    for (const r of ex) r.flush({ items: r.request.params.get('order') === 'asc' ? (opts.exams ?? []).slice(0, 1) : (opts.exams ?? []), nextCursor: null });
    await loading;
  };

  it('opens a file by reading its own sections only: medical, chart, plan (one page), newest and first exam', async () => {
    await openFile({ exams: [{ id: 'e1', at: '2026-11-01T12:00:00Z', note: 'n', chart: chartDto, voidedAt: null }] });
    const p = store.patientMap().get('p1')!;
    expect(p.medical).toEqual({ conditions: ['asthma'], allergies: 'penicillin', legacyMatched: ['x'] });
    expect(p.odontogram).toEqual(chartDto); expect(p.plan).toEqual([{ id: 'i1', procedure: 'filling', price: 300, status: 'planned', tooth: '11' }]);
    expect(p.examinations).toEqual([{ id: 'e1', patientId: 'p1', date: '2026-11-01', note: 'n', chart: chartDto }]);
  });

  it('saves a patient edit with the medical version it read, keeping the matched text the form does not show', async () => {
    await openFile();
    const done = store.updatePatient('p1', { fullName: 'Ann', phone: '1', medical: { conditions: ['asthma', 'diabetes'], allergies: 'penicillin' } }); await tick();
    ctl.expectOne(`${ROOT}/patients/p1`).flush(null); await tick();
    const m = ctl.expectOne(`${P}/medical`); expect(m.request.method).toBe('PUT');
    expect(m.request.body).toEqual({ expectedVersion: 5, conditions: ['asthma', 'diabetes'], allergies: 'penicillin', medications: '', legacyMatched: ['x'] });
    m.flush({ version: 6 }); await done;
    expect(store.patientMap().get('p1')?.medical?.conditions).toEqual(['asthma', 'diabetes']);
  });

  it('does not touch the medical record when only other fields changed', async () => {
    await openFile();
    const done = store.updatePatient('p1', { fullName: 'Ann B', phone: '1', medical: { conditions: ['asthma'], allergies: 'penicillin' } }); await tick();
    ctl.expectOne(`${ROOT}/patients/p1`).flush(null); await done; // no PUT /medical: ctl.verify() would fail otherwise
  });

  const work = (done = true) => ({ patientId: 'p1', items: [{ id: 'tmp', procedure: 'filling', price: 400, status: done ? 'done' as const : 'planned' as const, tooth: '16', date: '2026-11-20' }], before: chartDto as Record<string, unknown>, after: { ...chartDto, teeth: { '11': { status: 'ok' }, '16': { status: 'filling' } } } as Record<string, unknown>, date: '2026-11-20', name: 'Filling', baselineNote: 'Baseline' });

  it('records work in order: baseline exam (chart as it was), the changed tooth only, the exam, then the plan item with its own day', async () => {
    await openFile();
    const rec = store.recordProcedure(work()); await tick();
    ctl.expectOne((r) => r.method === 'POST' && r.url === `${P}/exams`).flush({ id: 'base' }, { status: 201, statusText: 'Created' }); await tick();
    const patch = ctl.expectOne((r) => r.method === 'PATCH' && r.url === `${P}/chart`);
    expect(patch.request.body.changes).toEqual([{ scope: 'teeth', tooth: '16', expectedRev: 0, replace: { status: 'filling' } }]); // one tooth, not the chart
    patch.flush({ revs: [{ scope: 'teeth', tooth: '16', rev: 1 }] }); await tick();
    const exam = ctl.expectOne((r) => r.method === 'POST' && r.url === `${P}/exams`); expect(exam.request.body.note).toBe('Filling'); exam.flush({ id: 'e2' }, { status: 201, statusText: 'Created' }); await tick();
    const plan = ctl.expectOne((r) => r.method === 'POST' && r.url === `${P}/plan`); expect(plan.request.body).toMatchObject({ status: 'done', date: '2026-11-20', tooth: '16', price: '400.00' }); plan.flush({ id: 'srv-i' }, { status: 201, statusText: 'Created' });
    await rec;
    const p = store.patientMap().get('p1')!;
    expect(p.plan?.map((i) => i.id)).toEqual(['i1', 'srv-i']); expect(p.examinations?.map((e) => e.id)).toEqual(['base', 'e2']);
    expect((p.odontogram as { teeth: Record<string, unknown> }).teeth['16']).toEqual({ status: 'filling' });
  });

  it('creates the stored chart from the "before" picture when the patient has none yet, so the baseline is right', async () => {
    await openFile({ chart: false });
    const rec = store.recordProcedure(work()); await tick();
    const init = ctl.expectOne((r) => r.method === 'POST' && r.url === `${P}/chart`); expect(init.request.body.chart).toEqual(chartDto); init.flush({ chart: chartDto, revs: revsDto }, { status: 201, statusText: 'Created' }); await tick();
    ctl.expectOne((r) => r.method === 'POST' && r.url === `${P}/exams`).flush({ id: 'base' }, { status: 201, statusText: 'Created' }); await tick();
    ctl.expectOne((r) => r.method === 'PATCH' && r.url === `${P}/chart`).flush({ revs: [{ scope: 'teeth', tooth: '16', rev: 1 }] }); await tick();
    ctl.expectOne((r) => r.method === 'POST' && r.url === `${P}/exams`).flush({ id: 'e2' }, { status: 201, statusText: 'Created' }); await tick();
    ctl.expectOne((r) => r.method === 'POST' && r.url === `${P}/plan`).flush({ id: 'srv-i' }, { status: 201, statusText: 'Created' }); await rec;
  });

  it('when a colleague changed the same tooth first, the save is refused, the chart is re-read and the error reaches the panel', async () => {
    await openFile({ exams: [{ id: 'e0', at: '2026-11-01T12:00:00Z', chart: chartDto }] });
    const rec = expect(store.recordProcedure(work())).rejects.toBeTruthy(); await tick();
    ctl.expectOne((r) => r.method === 'PATCH' && r.url === `${P}/chart`).flush({ error: { code: 'stale', message: 'Tooth 16 was changed by someone else' } }, { status: 409, statusText: 'Conflict' }); await tick();
    ctl.expectOne((r) => r.method === 'GET' && r.url === `${P}/chart`).flush({ chart: { ...chartDto, teeth: { '11': { status: 'ok' }, '16': { status: 'crown' } } }, revs: { ...revsDto, teeth: { '11': 2, '16': 7 } } }); await tick();
    // the failure path re-reads every section of the file
    ctl.expectOne(`${P}/medical`).flush({ conditions: [], allergies: '', medications: '', legacyMatched: [], version: 5 });
    ctl.expectOne((r) => r.url === `${P}/plan`).flush({ items: [], nextCursor: null });
    for (const r of ctl.match((r) => r.url === `${P}/exams`)) r.flush({ items: [], nextCursor: null });
    ctl.expectOne((r) => r.method === 'GET' && r.url === `${P}/chart`).flush({ chart: chartDto, revs: revsDto });
    await rec;
    expect(store.patientMap().get('p1')?.plan).toEqual([]); // nothing was added to the plan
  });

  it('plan: new items are created (server id), edits and "done" are sent, removals deleted; a refusal re-reads the plan', async () => {
    await openFile();
    const sync = store.changePlan('p1', (plan) => [{ ...plan[0], price: 350 }, { id: 'tmp', procedure: 'scaling', price: 150, status: 'planned' }]);
    await tick();
    const edit = ctl.expectOne(`${ROOT}/plan/i1`); expect(edit.request.method).toBe('PATCH'); expect(edit.request.body.price).toBe('350.00'); edit.flush(null); await tick();
    const add = ctl.expectOne((r) => r.method === 'POST' && r.url === `${P}/plan`); expect(add.request.body.price).toBe('150.00'); add.flush({ id: 'srv-2' }, { status: 201, statusText: 'Created' });
    await sync; expect(store.patientMap().get('p1')?.plan?.map((i) => i.id)).toEqual(['i1', 'srv-2']);
    const gone = store.changePlan('p1', () => []); await tick();
    ctl.expectOne(`${ROOT}/plan/i1`).flush({ error: { code: 'item_done', message: 'A completed treatment cannot be changed' } }, { status: 409, statusText: 'Conflict' }); await tick();
    ctl.expectOne((r) => r.url === `${P}/plan`).flush({ items: [{ id: 'i1', procedure: 'filling', price: '350.00', status: 'done', currency: 'MAD' }], nextCursor: null });
    await gone; expect(store.patientMap().get('p1')?.plan?.[0].status).toBe('done'); expect(store.persistenceError()).toBe('A completed treatment cannot be changed');
  });
});
