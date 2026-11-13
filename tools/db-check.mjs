#!/usr/bin/env node
// Checks a live PostgreSQL (Neon) against db/migrations. Reads DATABASE_URL from the environment or .env.local; changes nothing (the round trip is rolled back).
//   node tools/db-check.mjs
import pg from 'pg';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

let url = process.env.DATABASE_URL;
if (!url && existsSync('.env.local')) url = /^DATABASE_URL=["']?([^"'\n]+)/m.exec(readFileSync('.env.local', 'utf8'))?.[1];
if (!url) { console.error('DATABASE_URL not set (environment or .env.local)'); process.exit(2); }

const files = readdirSync('db/migrations').filter((f) => f.endsWith('.sql')).sort();
const expected = files.flatMap((f) => [...readFileSync(`db/migrations/${f}`, 'utf8').matchAll(/create table (\w+)/g)].map((m) => m[1]));
const versions = files.map((f) => f.replace('.sql', ''));
const client = new pg.Client({ connectionString: url });
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`); if (!ok) failed++; };
try {
  await client.connect();
  check('connected', true);
  const have = (await client.query("select table_name from information_schema.tables where table_schema = 'public'")).rows.map((r) => r.table_name);
  const missing = expected.filter((t) => !have.includes(t));
  check(`all ${expected.length} tables exist`, !missing.length, `missing: ${missing.join(', ')}`);
  const applied = (await client.query('select version from schema_migration').catch(() => ({ rows: [] }))).rows.map((r) => r.version);
  check('every migration recorded', versions.every((v) => applied.includes(v)), `applied: ${applied.join(', ') || 'none'}`);
  const noRls = (await client.query("select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'schema_migration' and not (c.relrowsecurity and c.relforcerowsecurity)")).rows.map((r) => r.relname);
  check('row-level security forced on every tenant table', !noRls.length, noRls.join(', '));
  const role = (await client.query('select current_user u, (select rolbypassrls or rolsuper from pg_roles where rolname = current_user) bypass')).rows[0];
  console.log(`INFO connected as ${role.u}${role.bypass ? ' (bypasses RLS: use a separate application role for the app)' : ''}`);
  await client.query('begin');
  await client.query("select set_config('app.clinic_id', 'check-clinic', true)");
  await client.query("insert into clinic (id, name) values ('check-clinic', 'check')");
  const seen = (await client.query('select count(*)::int n from clinic')).rows[0].n;
  await client.query('rollback');
  check('write and read inside a rolled-back transaction', seen === 1);
} catch (e) { check('database reachable and usable', false, e.message); }
await client.end().catch(() => {});
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
