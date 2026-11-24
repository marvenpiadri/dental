import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { PatientDocument } from '../../denteus/models/dental.models';
import { ApiSession } from './api-session.service';
import { FileUploadService } from './file-upload.service';

type Dto = Record<string, unknown>;
const PURPOSES = 'patient_document,xray,clinical_image';

/** The server's file record as the documents screen shows it. The bytes stay in the private bucket; `contentUrl` is an authorized address that redirects to a short-lived link. */
export const toDocument = (r: Dto): PatientDocument => ({
  id: String(r['id']), patientId: String(r['patientId']), name: String(r['name']), type: String(r['contentType']), size: Number(r['size']), addedAt: String(r['createdAt']),
  ...(r['tooth'] ? { tooth: String(r['tooth']) } : {}), ...(r['labOrderId'] ? { labOrderId: String(r['labOrderId']) } : {}), blob: new Blob([]),
});

@Injectable({ providedIn: 'root' })
export class FilesApi {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiSession);
  private readonly uploads = inject(FileUploadService);

  contentUrl = (id: string): string => this.api.url(`/files/${encodeURIComponent(id)}/content`);

  /** The newest documents of one patient, at most `pages` pages of 100. */
  async list(patientId: string, pages = 3): Promise<PatientDocument[]> {
    const out: PatientDocument[] = []; let cursor: string | null = null;
    for (let i = 0; i < pages; i++) {
      let params = new HttpParams().set('limit', '100'); if (cursor) params = params.set('cursor', cursor);
      const r: { items: Dto[]; nextCursor: string | null } = await firstValueFrom(this.http.get<{ items: Dto[]; nextCursor: string | null }>(this.api.url(`/patients/${encodeURIComponent(patientId)}/files`), { params }));
      out.push(...r.items.map(toDocument)); cursor = r.nextCursor; if (!cursor) break;
    }
    return out;
  }
  /** Pictures keep their quality (clinical_image); PDFs are plain documents. */
  upload(patientId: string, file: File): Promise<unknown> {
    return this.uploads.upload(file.type === 'application/pdf' ? 'patient_document' : 'clinical_image', file, { patientId });
  }
  async setTooth(id: string, tooth: string | null): Promise<void> { await firstValueFrom(this.http.patch(this.api.url(`/files/${encodeURIComponent(id)}`), { tooth })); }
  /** Clinical files are never deleted: this hides the file and keeps the record. */
  async remove(id: string, reason: string): Promise<void> { await firstValueFrom(this.http.post(this.api.url(`/files/${encodeURIComponent(id)}/void`), { reason })); }
}
