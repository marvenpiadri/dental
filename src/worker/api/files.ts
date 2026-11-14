import type { Ctx } from './context';
import { ApiError, id, json, limit } from '../http';
import { newId, randomToken, sha256Hex } from '../crypto';
import * as files from '../repo/files';
import * as patients from '../repo/patients';
import { audit } from '../repo/audit';

export const MAX_BYTES = 10 * 1024 * 1024;
/** What the clinic may store, by declared type. The file's own first bytes must agree (see sniff). */
const ALLOWED: Record<string, { kinds: readonly string[]; ext: string }> = {
  'image/jpeg': { kinds: ['xray', 'photo', 'document'], ext: 'jpg' }, 'image/png': { kinds: ['xray', 'photo', 'document'], ext: 'png' },
  'application/pdf': { kinds: ['document', 'pdf', 'other'], ext: 'pdf' },
};
function sniff(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
  return null;
}
const safeName = (n: string) => n.replace(/[\u0000-\u001f\\/"<>|:*?]/g, '_').trim().slice(0, 200) || 'file';

/** multipart/form-data: fields `file`, `kind`, optional `patientId`. Client-supplied keys and clinic ids are never read. */
export async function upload(c: Ctx) {
  const len = Number(c.req.headers.get('content-length') ?? '0');
  if (len > MAX_BYTES + 4096) throw new ApiError(413, 'too_large', 'Files are limited to 10 MB.');
  let form: FormData;
  try { form = await c.req.formData(); } catch { throw new ApiError(400, 'invalid', 'Send multipart/form-data.'); }
  const file = form.get('file'), kind = String(form.get('kind') ?? ''), pRaw = form.get('patientId');
  if (file === null || typeof file === 'string') throw new ApiError(400, 'invalid', 'file is required.');
  if (file.size === 0 || file.size > MAX_BYTES) throw new ApiError(413, 'too_large', 'Files must be 1 byte to 10 MB.');
  const rule = ALLOWED[file.type];
  if (!rule || !rule.kinds.includes(kind)) throw new ApiError(415, 'unsupported_type', 'Allowed: JPEG, PNG, PDF (kind must fit the type).');
  const bytes = await file.arrayBuffer();
  if (sniff(new Uint8Array(bytes, 0, Math.min(8, bytes.byteLength))) !== file.type) throw new ApiError(415, 'type_mismatch', 'The file content does not match its declared type.');
  let patientId: string | null = null;
  if (typeof pRaw === 'string' && pRaw) {
    patientId = id(pRaw, 'patientId');
    if (!(await patients.exists(c.db, c.s.clinicId, patientId))) throw new ApiError(422, 'unknown_patient', 'Patient is not in this clinic.');
  }
  const fid = newId(), key = `c/${c.s.clinicId}/${randomToken(24)}.${rule.ext}`, sha = await sha256Hex(bytes);
  await c.env.FILES.put(key, bytes, { httpMetadata: { contentType: file.type }, sha256: sha });
  try {
    await c.db.tx(async (t) => {
      await files.insert(t, c.s.clinicId, { id: fid, patientId, kind, r2Key: key, filename: safeName(file.name), mime: file.type, sizeBytes: bytes.byteLength, sha256: sha, uploadedBy: c.s.staffId });
      await audit(t, c.s.clinicId, c.s.staffId, 'file.upload', 'file', fid, `${kind} ${bytes.byteLength}B`);
    });
  } catch (e) { await c.env.FILES.delete(key).catch(() => undefined); throw e; }
  return json(publicView((await files.get(c.db, c.s.clinicId, fid))!), 201);
}
const publicView = ({ r2Key: _k, ...rest }: files.FileRow) => rest;
export async function list(c: Ctx) {
  const p = c.url.searchParams.get('patientId'), before = c.url.searchParams.get('before');
  const rows = await files.list(c.db, c.s.clinicId, { patientId: p ? id(p) : undefined, before: before ? id(before) : null, limit: limit(c.url, 50, 100) });
  return json({ items: rows.map(publicView) });
}
export async function meta(c: Ctx) {
  const f = await files.get(c.db, c.s.clinicId, id(c.params[0]));
  if (!f) throw new ApiError(404, 'not_found', 'File not found.');
  return json(publicView(f));
}
/** Streams through the Worker after the clinic check. Private: no public bucket URL exists. */
export async function download(c: Ctx) {
  const f = await files.get(c.db, c.s.clinicId, id(c.params[0]));
  if (!f) throw new ApiError(404, 'not_found', 'File not found.');
  const obj = await c.env.FILES.get(f.r2Key);
  if (!obj) throw new ApiError(404, 'not_found', 'File content is missing.');
  await audit(c.db, c.s.clinicId, c.s.staffId, 'file.download', 'file', f.id);
  return new Response(obj.body, { headers: { 'Content-Type': f.mime, 'Content-Length': String(obj.size), 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
    'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "default-src 'none'; sandbox" } });
}
export async function remove(c: Ctx) {
  const f = await files.get(c.db, c.s.clinicId, id(c.params[0]));
  if (!f) throw new ApiError(404, 'not_found', 'File not found.');
  await c.db.tx(async (t) => { await files.softDelete(t, c.s.clinicId, f.id, c.s.staffId); await audit(t, c.s.clinicId, c.s.staffId, 'file.delete', 'file', f.id); });
  return json({ ok: true });
}
