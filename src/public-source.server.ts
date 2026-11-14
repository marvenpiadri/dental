import type { Db } from './worker/db';
import type { Env } from './worker/env';
import { PublicClinic, parseRecords } from './app/denteus/rules/public-record';

/** Live public clinic pages come from the database (table clinic_public_profile); the shape is the one parseRecords() validates. Cached for a minute per isolate. */
let cache: { at: number; rows: PublicClinic[] } | null = null;
export async function loadPublicClinics(db: Db, now = Date.now()): Promise<PublicClinic[]> {
  if (cache && now - cache.at < 60_000) return cache.rows;
  const rows = await db.rows("SELECT p.payload FROM clinic_public_profile p JOIN clinic c ON c.id = p.clinic_id WHERE c.status = 'active' LIMIT 5000");
  const parsed = parseRecords(rows.map((r) => (typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload)));
  cache = { at: now, rows: parsed };
  return parsed;
}
export const siteOrigin = (env: Pick<Env, 'APP_ORIGIN'>): string => (env.APP_ORIGIN ?? 'https://dontalist.com').replace(/\/$/, '');
