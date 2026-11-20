import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { apiInterceptor, apiMessage } from './api.interceptor';
import { ApiSession } from './api-session.service';
import { API_CONFIG } from './api-config';

const API = 'https://api.example.test';
const ME = { id: 's', clinicId: 'c', name: 'Dr A', role: 'dentist', permissions: ['patients.view'] };

describe('apiInterceptor and ApiSession', () => {
  let http: HttpClient, ctl: HttpTestingController, session: ApiSession;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: API_CONFIG, useValue: { url: API } }, provideHttpClient(withInterceptors([apiInterceptor])), provideHttpClientTesting()] });
    http = TestBed.inject(HttpClient); ctl = TestBed.inject(HttpTestingController); session = TestBed.inject(ApiSession);
  });
  afterEach(() => ctl.verify());

  const signIn = async () => {
    const p = session.login('a@b.co', 'pw');
    ctl.expectOne(`${API}/v1/auth/login`).flush({ staff: { id: 's' } });
    await Promise.resolve(); await Promise.resolve();
    ctl.expectOne(`${API}/v1/auth/me`).flush(ME);
    await p;
  };

  it('sends credentials, adds the CSRF header to writes only, and leaves other origins alone', async () => {
    await signIn();
    http.post(session.url('/patients'), {}).subscribe(); const w = ctl.expectOne(`${API}/v1/patients`);
    expect(w.request.withCredentials).toBe(true); expect(w.request.headers.get('x-dontalist-csrf')).toBe('1'); w.flush({});
    http.get(session.url('/patients')).subscribe(); const g = ctl.expectOne(`${API}/v1/patients`);
    expect(g.request.withCredentials).toBe(true); expect(g.request.headers.has('x-dontalist-csrf')).toBe(false); g.flush({});
    http.post('https://other.example/x', {}).subscribe(); const o = ctl.expectOne('https://other.example/x');
    expect(o.request.headers.has('x-dontalist-csrf')).toBe(false); expect(o.request.withCredentials).toBe(false); o.flush({});
  });
  it('signs the page out when the server ends the session, but not on a wrong password', async () => {
    http.post(session.url('/auth/login'), {}).subscribe({ error: () => undefined }); ctl.expectOne(`${API}/v1/auth/login`).flush({}, { status: 401, statusText: 'x' });
    await signIn();
    expect(session.signedIn()).toBe(true); expect(session.can('patients.view')).toBe(true); expect(session.can('clinical.view')).toBe(false);
    http.get(session.url('/patients')).subscribe({ error: () => undefined }); ctl.expectOne(`${API}/v1/patients`).flush({ error: { code: 'unauthenticated' } }, { status: 401, statusText: 'x' });
    expect(session.signedIn()).toBe(false);
  });
  it('reads the server message, never the raw body', () => {
    let err: unknown;
    http.get(session.url('/x')).subscribe({ error: (e) => (err = e) }); ctl.expectOne(`${API}/v1/x`).flush({ error: { code: 'forbidden', message: 'Your role cannot do this.' } }, { status: 403, statusText: 'x' });
    expect(apiMessage(err)).toBe('Your role cannot do this.'); expect(apiMessage(new Error('boom'), 'fallback')).toBe('fallback');
  });
});
