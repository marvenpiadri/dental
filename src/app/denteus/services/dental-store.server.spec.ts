import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_CONFIG } from '../../core/api/api-config';
import { apiInterceptor } from '../../core/api/api.interceptor';
import { AuthService } from '../../core/auth/auth.service';
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
