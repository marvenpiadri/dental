import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ApiSession } from './api-session.service';

/** Mirrors GET /v1/files/purposes: what the server accepts for each kind of file. `lossless` purposes (X-rays, clinical images) are never re-encoded. */
export interface PurposeRule { types: string[]; maxBytes: number; lossless: boolean; canUpload: boolean }
/** Where the file belongs: exactly one of these, the server re-checks it against the signed-in clinic. */
export interface FileOwner { patientId?: string; labOrderId?: string; subjectId?: string }
export interface UploadedFile { id: string; name: string; contentType: string; size: number; purpose: string }
export interface UploadState { phase: 'preparing' | 'uploading' | 'finishing' | 'done' | 'failed'; progress: number; error?: string }

const MAX_EDGE = 1600, JPEG_WEBP_QUALITY = 0.85, ATTEMPTS = 3;

/** A photo is shrunk only when it is a re-encodable image, not a lossless purpose, and actually bigger than needed. Pure so it can be tested without a canvas. */
export function shouldCompress(rule: PurposeRule, file: { type: string; size: number }, width: number, height: number): boolean {
  if (rule.lossless || !/^image\/(jpeg|png|webp)$/.test(file.type)) return false;
  return Math.max(width, height) > MAX_EDGE || file.size > 1_000_000;
}
export const fitWithin = (w: number, h: number, edge = MAX_EDGE): [number, number] => {
  const k = Math.min(1, edge / Math.max(w, h)); return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
};

/** One upload path for every module: validate, (maybe) shrink, ask the API for a signed URL, PUT straight to the bucket with progress and retry, then confirm. */
@Injectable({ providedIn: 'root' })
export class FileUploadService {
  private readonly http = inject(HttpClient);
  private readonly session = inject(ApiSession);
  private rules?: Promise<Record<string, PurposeRule>>;

  purposes(): Promise<Record<string, PurposeRule>> {
    return this.rules ??= firstValueFrom(this.http.get<Record<string, PurposeRule>>(this.session.url('/files/purposes'))).catch((e) => { this.rules = undefined; throw e; });
  }

  async upload(purpose: string, file: File, owner: FileOwner, onState: (s: UploadState) => void = () => undefined, wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))): Promise<UploadedFile> {
    try {
      onState({ phase: 'preparing', progress: 0 });
      const rule = (await this.purposes())[purpose];
      if (!rule?.canUpload) throw new Error('You are not allowed to upload this kind of file.');
      const body = await this.prepare(rule, file);
      if (!rule.types.includes(body.type)) throw new Error('This file type is not accepted.');
      if (body.size > rule.maxBytes) throw new Error(`The file is too large (limit ${Math.round(rule.maxBytes / 1_048_576)} MB).`);
      const created = await firstValueFrom(this.http.post<{ id: string; upload: { url: string; headers: Record<string, string> } }>(this.session.url('/files'), { purpose, name: file.name, contentType: body.type, size: body.size, ...owner }));
      await this.put(created.upload, body, (p) => onState({ phase: 'uploading', progress: p }), wait);
      onState({ phase: 'finishing', progress: 1 });
      const done = await this.retry(() => firstValueFrom(this.http.post<UploadedFile>(this.session.url(`/files/${created.id}/complete`), {})), wait); // safe to repeat: the server answers the same for a finished file
      onState({ phase: 'done', progress: 1 });
      return done;
    } catch (e) {
      onState({ phase: 'failed', progress: 0, error: e instanceof Error ? e.message : 'Upload failed.' });
      throw e;
    }
  }

  private async put(up: { url: string; headers: Record<string, string> }, body: Blob, progress: (p: number) => void, wait: (ms: number) => Promise<void>): Promise<void> {
    await this.retry(() => new Promise<void>((resolve, reject) => {
      // Direct to the bucket: this URL is not an API address, so no cookie or CSRF header is attached.
      this.http.put(up.url, body, { headers: up.headers, observe: 'events', reportProgress: true }).subscribe({
        next: (ev) => { if (ev.type === HttpEventType.UploadProgress && ev.total) progress(ev.loaded / ev.total); if (ev.type === HttpEventType.Response) resolve(); },
        error: reject,
      });
    }), wait);
  }

  /** Network errors, 5xx and 429 are retried with a growing pause; a 4xx (bad signature, expired link) is final. */
  private async retry<T>(fn: () => Promise<T>, wait: (ms: number) => Promise<void>): Promise<T> {
    for (let i = 1; ; i++) {
      try { return await fn(); } catch (e) {
        const status = (e as { status?: number }).status ?? 0;
        if (i >= ATTEMPTS || (status >= 400 && status < 500 && status !== 429)) throw e;
        await wait(500 * 2 ** (i - 1));
      }
    }
  }

  private async prepare(rule: PurposeRule, file: File): Promise<Blob> {
    if (rule.lossless || !/^image\/(jpeg|png|webp)$/.test(file.type) || typeof createImageBitmap !== 'function') return file;
    const bmp = await createImageBitmap(file);
    try {
      if (!shouldCompress(rule, file, bmp.width, bmp.height)) return file;
      const [w, h] = fitWithin(bmp.width, bmp.height), canvas = new OffscreenCanvas(w, h);
      canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
      const out = await canvas.convertToBlob({ type: rule.types.includes('image/webp') ? 'image/webp' : 'image/jpeg', quality: JPEG_WEBP_QUALITY });
      return out.size < file.size ? out : file; // never make it bigger
    } finally { bmp.close(); }
  }
}
