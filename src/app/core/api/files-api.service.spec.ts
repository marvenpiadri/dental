import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_CONFIG } from './api-config';
import { apiInterceptor } from './api.interceptor';
import { FilesApi, toDocument } from './files-api.service';

describe('FilesApi (unit, mock HTTP)', () => {
  let api: FilesApi, ctl: HttpTestingController;
  const R = 'https://api.example.test/v1';
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: API_CONFIG, useValue: { url: 'https://api.example.test' } }, provideHttpClient(withInterceptors([apiInterceptor])), provideHttpClientTesting()] });
    api = TestBed.inject(FilesApi); ctl = TestBed.inject(HttpTestingController);
  });
  afterEach(() => ctl.verify());
  const dto = (o = {}) => ({ id: 'f1', patientId: 'p1', name: 'x.png', contentType: 'image/png', size: 10, createdAt: '2026-11-20T10:00:00.000Z', tooth: null, labOrderId: null, ...o });

  it('maps a file record and never carries bytes', () => {
    expect(toDocument(dto({ tooth: '16' }))).toMatchObject({ id: 'f1', type: 'image/png', tooth: '16', addedAt: '2026-11-20T10:00:00.000Z' });
    expect(toDocument(dto()).tooth).toBeUndefined();
  });
  it('lists newest pages of 100 only, and stops at the page cap', async () => {
    const p = api.list('p1', 2);
    const a = ctl.expectOne((r) => r.url === `${R}/patients/p1/files`); expect(a.request.params.get('limit')).toBe('100'); a.flush({ items: [dto()], nextCursor: 'c1' });
    await new Promise((r) => setTimeout(r));
    const b = ctl.expectOne((r) => r.url === `${R}/patients/p1/files`); expect(b.request.params.get('cursor')).toBe('c1'); b.flush({ items: [dto({ id: 'f2' })], nextCursor: 'c2' });
    expect((await p).map((d) => d.id)).toEqual(['f1', 'f2']);
  });
  it('tags, clears and voids through the API; the content address is the authorized one', async () => {
    const t = api.setTooth('f1', '16'); const r = ctl.expectOne(`${R}/files/f1`); expect(r.request.method).toBe('PATCH'); expect(r.request.body).toEqual({ tooth: '16' }); r.flush(null, { status: 204, statusText: 'No Content' }); await t;
    const v = api.remove('f1', 'gone'); const q = ctl.expectOne(`${R}/files/f1/void`); expect(q.request.body).toEqual({ reason: 'gone' }); q.flush(null, { status: 204, statusText: 'No Content' }); await v;
    expect(api.contentUrl('f1')).toBe(`${R}/files/f1/content`);
  });
});
