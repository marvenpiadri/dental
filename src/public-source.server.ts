import { readFile } from 'node:fs/promises';
import { PublicClinic, parseRecords } from './app/denteus/rules/public-record';

/**
 * Pre-backend seam: the owner exports `public-clinics.json` from Settings and the server reads it here.
 * The shape is the one the future API returns, so replacing this function with a database query changes nothing else.
 * shortcut: re-read on every request, fine for a handful of clinics; the online version queries a database instead.
 */
export async function loadPublicClinics(): Promise<PublicClinic[]> {
  try { return parseRecords(JSON.parse(await readFile(process.env['DONTALIST_PUBLIC_DATA'] ?? 'public-clinics.json', 'utf8'))); } catch { return []; }
}

export const siteOrigin = (): string => (process.env['DONTALIST_ORIGIN'] ?? 'https://dontalist.com').replace(/\/$/, '');
