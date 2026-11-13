#!/usr/bin/env node
// Applies db/migrations to an in-memory PostgreSQL (PGlite), imports a backup, and checks the rules the schema is meant to enforce.
//   npm i --no-save @electric-sql/pglite && node tools/check-migration.mjs [backup.json]
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';

const backup = process.argv[2] ?? 'db/fixtures/sample-backup.json';
const db = new PGlite({ extensions: { btree_gist } });
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`); if (!ok) failed++; };
const refuses = async (sql, params) => { try { await db.query(sql, params); return false; } catch { return true; } };
const one = async (sql) => (await db.query(sql)).rows[0];

for (const f of readdirSync('db/migrations').sort()) await db.exec(readFileSync(`db/migrations/${f}`, 'utf8'));
check('migrations applied', (await one('select count(*)::int n from schema_migration')).n === 3);

const sql = execFileSync('node', ['tools/backup-to-sql.mjs', backup, 'clinic-1'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
await db.exec(sql);
const n = async (t) => (await one(`select count(*)::int n from ${t}`)).n;
await db.exec("select set_config('app.clinic_id', 'clinic-1', false)");
check('patient imported with quote intact', (await one("select full_name from patient")).full_name === "Amina O'Brien");
check('appointment with missing patient skipped', (await n('appointment')) === 1);
check('payment to unknown payer kept with payer emptied', (await one("select payer_id from payment where id = 'pay-3'")).payer_id === null);
check('credit note linked to its invoice', (await one("select cancels_id from invoice where id = 'inv-2'")).cancels_id === 'inv-1');
check('item keeps its own currency', (await one("select currency from treatment_item where id = 'i-2'")).currency === 'EUR');
check('brand points at generic', (await one("select generic_id from med_library where id = 'b-1'")).generic_id === 'g-1');
check('staff imported without PIN columns', (await n('staff')) === 1 && (await n('staff_event')) === 1 && !(await db.query("select 1 from information_schema.columns where table_name = 'staff' and column_name ilike '%pin%'")).rows.length);
check('custom insurer and patient insurance imported', (await n('insurance_provider')) === 1 && (await n('patient_insurance')) === 1);
check('document bytes decoded', (await one("select length(content)::int n from patient_document")).n === 4);
check('audit rows kept', (await n('record_audit')) === 1);

check('double-booked chair refused', await refuses("insert into appointment (id, clinic_id, patient_id, dentist_id, chair_id, type, status, starts_at, ends_at, created_at, created_by) values ('a-x','clinic-1','p-1','d1','c1','filling','scheduled','2026-11-05T09:30:00Z','2026-11-05T10:30:00Z',now(),'t')"));
check('cancelled booking does not block the slot', !(await refuses("insert into appointment (id, clinic_id, patient_id, dentist_id, chair_id, type, status, starts_at, ends_at, created_at, created_by) values ('a-y','clinic-1','p-1','d1','c1','filling','cancelled','2026-11-05T09:30:00Z','2026-11-05T10:30:00Z',now(),'t')")));
check('brand without generic refused', await refuses("insert into med_library (id, clinic_id, kind, name) values ('b-2','clinic-1','brand','Orphan')"));
check('duplicate medication name refused (accent/case-insensitive key)', await refuses("insert into med_library (id, clinic_id, kind, name) values ('g-2','clinic-1','generic','AMOXICILLIN')"));
check('payer in use cannot be deleted', await refuses("delete from payer where id = 'py-1'"));
check('allergy in use cannot be deleted', await refuses("delete from allergy_def where id = 'al-1'"));
check('patient with money records cannot be deleted', await refuses("delete from patient where id = 'p-1'"));
check('bad currency refused', await refuses("insert into payment (id, clinic_id, patient_id, amount, currency, method, paid_at) values ('p9','clinic-1','p-1',1,'dh','cash',now())"));

// tenant isolation: switch to a role subject to RLS
await db.exec("create role app_user; grant all on all tables in schema public to app_user; grant all on all sequences in schema public to app_user; set role app_user");
await db.exec("select set_config('app.clinic_id', 'clinic-2', false)");
check('other clinic sees nothing', (await n('patient')) === 0 && (await n('payment')) === 0 && (await n('staff')) === 0);
check('other clinic cannot write into clinic-1', await refuses("insert into payer (id, clinic_id, type, name) values ('z','clinic-1','other','X')"));
await db.exec("select set_config('app.clinic_id', 'clinic-1', false)");
check('clinic-1 sees its patient', (await n('patient')) === 1);
await db.exec("select set_config('app.clinic_id', '', false)");
check('no tenant set shows nothing', (await n('patient')) === 0);

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
