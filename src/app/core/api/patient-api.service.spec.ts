import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { apiInterceptor } from './api.interceptor';
import { API_CONFIG } from './api-config';
import { PatientApi, toBody, toPatient } from './patient-api.service';

const API = 'https://api.example.test/v1/patients';

describe('PatientApi (unit, mock HTTP)', () => {
  let api: PatientApi, ctl: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: API_CONFIG, useValue: { url: 'https://api.example.test' } }, provideHttpClient(withInterceptors([apiInterceptor])), provideHttpClientTesting()] });
    api = TestBed.inject(PatientApi); ctl = TestBed.inject(HttpTestingController);
  });
  afterEach(() => ctl.verify());

  it('maps nulls to missing keys and never exposes the photo file id', () => {
    expect(toPatient({ id: 'a', fullName: 'Ann', phone: null, email: null, mapUrl: 'https://maps.google.com/?ll=1,2', photoFileId: 'f' })).toEqual({ id: 'a', fullName: 'Ann', mapUrl: 'https://maps.google.com/?ll=1,2' });
  });

  it('sends empty optional fields as null so a save can clear them', () => {
    const b = toBody({ fullName: 'Ann', phone: '', email: '', city: 'Rabat' });
    expect(b).toMatchObject({ fullName: 'Ann', phone: null, email: null, city: 'Rabat', mapUrl: null, notes: null });
    expect(b).not.toHaveProperty('medical');
  });

  it('lists one page with the search, archived and alert filters and a cursor, and caps nothing locally', async () => {
    const p = api.list({ q: ' élodie ', archived: true, alert: true, cursor: 'c1', limit: 25 });
    const r = ctl.expectOne((x) => x.url === API); expect(r.request.method).toBe('GET');
    expect(r.request.params.get('q')).toBe('élodie'); expect(r.request.params.get('archived')).toBe('true'); expect(r.request.params.get('alert')).toBe('true');
    expect(r.request.params.get('cursor')).toBe('c1'); expect(r.request.params.get('limit')).toBe('25');
    r.flush({ items: [{ id: 'a', fullName: 'Élodie', phone: '06', email: null }], nextCursor: 'c2' });
    expect(await p).toEqual({ items: [{ id: 'a', fullName: 'Élodie', phone: '06' }], nextCursor: 'c2' });
  });

  it('defaults to a page of 50 and omits unset filters', () => {
    void api.list();
    const r = ctl.expectOne((x) => x.url === API);
    expect(r.request.params.get('limit')).toBe('50'); expect(r.request.params.has('q')).toBe(false); expect(r.request.params.has('archived')).toBe(false);
    r.flush({ items: [], nextCursor: null });
  });

  it('creates, edits, archives, restores and merges through the right endpoints, with the CSRF header on writes', async () => {
    const c = api.create({ fullName: 'Ann', phone: '06' });
    const post = ctl.expectOne(API); expect(post.request.method).toBe('POST'); expect(post.request.headers.get('x-dontalist-csrf')).toBe('1');
    post.flush({ id: 'id1', number: 'P-0001' }); expect(await c).toEqual({ id: 'id1', number: 'P-0001' });

    const u = api.update('id1', { fullName: 'Ann B', phone: '06' });
    const patch = ctl.expectOne(`${API}/id1`); expect(patch.request.method).toBe('PATCH'); expect(patch.request.body.fullName).toBe('Ann B'); patch.flush(null); await u;

    const a = api.archive('id1', true); ctl.expectOne(`${API}/id1/archive`).flush(null); await a;
    const r = api.archive('id1', false); ctl.expectOne(`${API}/id1/unarchive`).flush(null); await r;

    const m = api.merge('drop', 'keep'); const mr = ctl.expectOne(`${API}/drop/merge`); expect(mr.request.body).toEqual({ intoId: 'keep' }); mr.flush(null); await m;
  });

  it('percent-encodes ids so a hostile id cannot change the path', () => {
    void api.get('a/../b?x');
    ctl.expectOne(`${API}/a%2F..%2Fb%3Fx`).flush({ id: 'x', fullName: 'X' });
  });
});
