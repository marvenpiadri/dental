/** Largest file accepted, per file. IndexedDB can hold more, but a phone photo or a scanned X-ray fits well inside this. */
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

/** `accept` attribute of the file picker. Images open in the browser; so do PDFs. */
export const ACCEPTED = 'image/png,image/jpeg,image/webp,application/pdf';

const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];

export type FileProblem = 'type' | 'size';

/** Checks a picked file before it is stored: the picker's filter can be bypassed by drag and drop. */
export function fileProblem(file: { type: string; size: number }): FileProblem | null {
  if (!TYPES.includes(file.type)) return 'type';
  if (file.size > MAX_DOCUMENT_BYTES || file.size === 0) return 'size';
  return null;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
