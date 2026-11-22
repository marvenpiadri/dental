import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { apiInterceptor } from './api.interceptor';
import { API_CONFIG } from './api-config';
import { FileUploadService, UploadState, fitWithin, shouldCompress } from './file-upload.service';

const API = 'https://api.example.test', R2 = 'https://acct.r2.cloudflarestorage.com/dontalist/c/xray/k?X-Amz-Signature=s';
const RULES = {
  xray: { types: ['image/jpeg', 'image/png', 'application/dicom'], maxBytes: 104_857_600, lossless: true, canUpload: true },
  patient_photo: { types: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 5_000_000, lossless: false, canUpload: true },
  lab_attachment: { types: ['application/pdf'], maxBytes: 1_000, lossless: false, canUpload: false },
};

describe('compression rules', () => {
  it('never re-encodes lossless purposes or non-images; shrinks only big photos', () => {
    expect(shouldCompress(RULES.xray, { type: 'image/png', size: 9e6 }, 5000, 4000)).toBe(false);
    expect(shouldCompress(RULES.patient_photo, { type: 'application/pdf', size: 9e6 }, 0, 0)).toBe(false);
    expect(shouldCompress(RULES.patient_photo, { type: 'image/jpeg', size: 200_000 }, 800, 600)).toBe(false);
    expect(shouldCompress(RULES.patient_photo, { type: 'image/jpeg', size: 200_000 }, 4000, 3000)).toBe(true);
    expect(shouldCompress(RULES.patient_photo, { type: 'image/png', size: 3e6 }, 800, 600)).toBe(true);
  });
  it('fits within the edge keeping the ratio, never upscales', () => {
    expect(fitWithin(4000, 3000)).toEqual([1600, 1200]); expect(fitWithin(800, 600)).toEqual([800, 600]);
  });
});

describe('FileUploadService', () => {
  let svc: FileUploadService, ctl: HttpTestingController; const states: UploadState[] = [], noWait = () => Promise.resolve();
  const file = new File([new Uint8Array(100)], 'a.dcm', { type: 'application/dicom' });
  const tick = () => new Promise((r) => setTimeout(r, 0));
  beforeEach(() => {
    states.length = 0;
    TestBed.configureTestingModule({ providers: [{ provide: API_CONFIG, useValue: { url: API } }, provideHttpClient(withInterceptors([apiInterceptor])), provideHttpClientTesting()] });
    svc = TestBed.inject(FileUploadService); ctl = TestBed.inject(HttpTestingController);
  });
  afterEach(() => ctl.verify());
  const rules = async () => { await tick(); ctl.expectOne(`${API}/v1/files/purposes`).flush(RULES); await tick(); };

  it('creates the row, PUTs straight to the bucket without cookie or CSRF, then completes', async () => {
    const p = svc.upload('xray', file, { patientId: 'p1' }, (s) => states.push(s), noWait); await rules();
    const create = ctl.expectOne(`${API}/v1/files`); expect(create.request.body).toMatchObject({ purpose: 'xray', name: 'a.dcm', contentType: 'application/dicom', size: 100, patientId: 'p1' });
    expect(create.request.headers.get('x-dontalist-csrf')).toBe('1'); create.flush({ id: 'f1', upload: { url: R2, headers: { 'Content-Type': 'application/dicom' } } }); await tick();
    const put = ctl.expectOne(R2); expect(put.request.method).toBe('PUT'); expect(put.request.withCredentials).toBe(false); expect(put.request.headers.has('x-dontalist-csrf')).toBe(false); expect(put.request.headers.get('Content-Type')).toBe('application/dicom'); put.flush(null); await tick();
    ctl.expectOne(`${API}/v1/files/f1/complete`).flush({ id: 'f1', name: 'a.dcm', contentType: 'application/dicom', size: 100, purpose: 'xray' });
    expect((await p).id).toBe('f1'); expect(states.map((s) => s.phase)).toEqual(['preparing', 'finishing', 'done']);
  });
  it('retries a failed PUT (5xx) but gives up at once on a 4xx', async () => {
    const p = expect(svc.upload('xray', file, { patientId: 'p1' }, () => undefined, noWait)).rejects.toBeTruthy(); await rules();
    ctl.expectOne(`${API}/v1/files`).flush({ id: 'f2', upload: { url: R2, headers: {} } }); await tick();
    ctl.expectOne(R2).flush('x', { status: 503, statusText: 'busy' }); await tick();
    ctl.expectOne(R2).flush('x', { status: 403, statusText: 'expired' });
    await p; ctl.expectNone(`${API}/v1/files/f2/complete`);
  });
  it('rejects before any network write: not allowed, wrong type, too large', async () => {
    const a = expect(svc.upload('lab_attachment', file, { labOrderId: 'l' }, (s) => states.push(s), noWait)).rejects.toThrow(/not allowed/); await rules(); await a;
    await expect(svc.upload('patient_photo', file, { subjectId: 's' }, () => undefined, noWait)).rejects.toThrow(/not accepted/);
    const big = new File([new Uint8Array(6_000_000)], 'b.png', { type: 'image/png' });
    await expect(svc.upload('patient_photo', big, { subjectId: 's' }, () => undefined, noWait)).rejects.toThrow(/too large/);
    expect(states.at(-1)?.phase).toBe('failed'); ctl.expectNone(`${API}/v1/files`);
  });
});
