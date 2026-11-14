#!/usr/bin/env node
// Applies db/migrations/*.sql to TiDB Cloud through the same HTTPS serverless driver the Worker uses.
//   node tools/db-migrate.mjs --check            validate the files offline (names, order, checksums, forbidden statements). Needs no database.
//   node tools/db-migrate.mjs --plan             show what would run against TIDB_DATABASE_URL (reads the ledger, writes nothing)
//   node tools/db-migrate.mjs --apply            run the pending migrations, one at a time, recording each in schema_migration
// Migrations are forward-only and never edited after they have been applied (the checksum is compared). TiDB DDL is not transactional:
// a migration that fails half-way must be fixed by a NEW migration, so keep each file small and re-runnable by hand.
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
const mode = process.argv.includes('--apply') ? 'apply' : process.argv.includes('--plan') ? 'plan' : 'check';
const FORBIDDEN = [[/CREATE\s+(TRIGGER|PROCEDURE|EVENT|FUNCTION)/i, 'TiDB has no triggers, procedures, events or UDFs'], [/\bCHECK\s*\(/i, 'CHECK is off by default on TiDB Cloud; validate in the Worker'],
  [/\bDROP\s+(TABLE|DATABASE)\b/i, 'destructive; needs an explicit, reviewed migration'], [/\bTRUNCATE\b/i, 'destructive']];

const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const list = files.map((f) => { const sql = readFileSync(join(dir, f), 'utf8'); return { f, sql, sum: createHash('sha256').update(sql).digest('hex') }; });
let bad = 0;
list.forEach((m, i) => {
  if (!new RegExp(`^${String(i + 1).padStart(4, '0')}_[a-z0-9_]+\\.sql$`).test(m.f)) { console.error(`${m.f}: name must be ${String(i + 1).padStart(4, '0')}_snake_case.sql (no gaps)`); bad++; }
  const code = m.sql.replace(/--.*$/gm, '');
  for (const [re, why] of FORBIDDEN) if (re.test(code) && !m.sql.includes(`-- allow: ${re.source.slice(0, 12)}`)) { console.error(`${m.f}: ${why}`); bad++; }
  if (/utf8(?!mb4)/i.test(code)) { console.error(`${m.f}: use utf8mb4`); bad++; }
});
if (bad) process.exit(1);
if (mode === 'check') { console.log(`${list.length} migration(s) OK:\n` + list.map((m) => `  ${m.f}  ${m.sum.slice(0, 12)}`).join('\n')); process.exit(0); }

const url = process.env.TIDB_DATABASE_URL;
if (!url) { console.error('Set TIDB_DATABASE_URL (a migration-only user, not the Worker\'s).'); process.exit(2); }
const { connect } = await import('@tidbcloud/serverless');
const conn = connect({ url });
await conn.execute('CREATE TABLE IF NOT EXISTS schema_migration (name VARCHAR(100) NOT NULL, checksum CHAR(64) NOT NULL, applied_at DATETIME(3) NOT NULL, PRIMARY KEY (name)) DEFAULT CHARSET=utf8mb4');
const done = new Map((await conn.execute('SELECT name, checksum FROM schema_migration')).map((r) => [r.name, r.checksum]));
for (const [name, sum] of done) { const m = list.find((x) => x.f === name); if (!m || m.sum !== sum) { console.error(`${name}: applied migration was changed or removed. Never edit an applied file; add a new one.`); process.exit(1); } }
const pending = list.filter((m) => !done.has(m.f));
console.log(pending.length ? `Pending: ${pending.map((m) => m.f).join(', ')}` : 'Up to date.');
if (mode === 'plan') process.exit(0);
for (const m of pending) {
  const statements = m.sql.replace(/--.*$/gm, '').split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean);
  for (const s of statements) await conn.execute(s);
  await conn.execute('INSERT INTO schema_migration (name, checksum, applied_at) VALUES (?,?,UTC_TIMESTAMP(3))', [m.f, m.sum]);
  console.log(`applied ${m.f} (${statements.length} statements)`);
}
