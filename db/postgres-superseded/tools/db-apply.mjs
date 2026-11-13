#!/usr/bin/env node
// Applies the db/postgres-superseded/migrations files that the database has not recorded yet, in order. Reads DATABASE_URL from the environment or .env.local.
// Use an owner role; the app should connect as a different role so row-level security applies.
//   node db/postgres-superseded/tools/db-apply.mjs            then   node db/postgres-superseded/tools/db-check.mjs
import pg from 'pg';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

let url = process.env.DATABASE_URL;
if (!url && existsSync('.env.local')) url = /^DATABASE_URL=["']?([^"'\n]+)/m.exec(readFileSync('.env.local', 'utf8'))?.[1];
if (!url) { console.error('DATABASE_URL not set (environment or .env.local)'); process.exit(2); }
const client = new pg.Client({ connectionString: url });
await client.connect();
const applied = new Set((await client.query("select to_regclass('public.schema_migration') t")).rows[0].t ? (await client.query('select version from schema_migration')).rows.map((r) => r.version) : []);
let ran = 0;
for (const f of readdirSync('db/postgres-superseded/migrations').filter((x) => x.endsWith('.sql')).sort()) {
  const version = f.replace('.sql', '');
  if (applied.has(version)) { console.log(`skip  ${version} (already applied)`); continue; }
  try { await client.query(readFileSync(`db/postgres-superseded/migrations/${f}`, 'utf8')); console.log(`apply ${version}`); ran++; }
  catch (e) { await client.query('rollback').catch(() => {}); console.error(`FAILED ${version}: ${e.message}`); await client.end(); process.exit(1); }
}
console.log(ran ? `done: ${ran} migration(s) applied` : 'nothing to apply');
await client.end();
