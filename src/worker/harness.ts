// Test support only (excluded from the app build). A MySQL-dialect schema is loaded from the REAL migration file and translated to an in-memory SQLite
// engine so request handling, SQL logic, clinic scoping and constraints can be exercised without a TiDB cluster. It is a stand-in:
// it proves our logic and composite foreign keys, NOT TiDB dialect compatibility. That needs a run against TiDB Cloud (see docs/architecture-tidb.md).
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type { Db } from './db';
import type { Env, R2Like } from './env';
import { hashPassword, newId } from './crypto';
import { toDb } from './time';

export function translate(mysql: string): string[] {
  return mysql.replace(/--.*$/gm, '').split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean).map((stmt) => stmt
    .replace(/\)\s*DEFAULT CHARSET=utf8mb4/, ')')
    .replace(/ENUM\([^)]*\)/g, 'TEXT').replace(/\b(?:VAR)?CHAR\(\d+\)/g, 'TEXT').replace(/DATETIME\(3\)/g, 'TEXT').replace(/\bJSON\b/g, 'TEXT')
    .replace(/\b(?:SMALLINT|INT)\b/g, 'INTEGER').replace(/\bDATE\b/g, 'TEXT')
    .replace(/^\s*UNIQUE KEY \w+ \(/gm, '  UNIQUE (').replace(/^\s*KEY \w+ \([^)]*\),?\n/gm, '')
    .replace(/,\s*\)\s*$/, '\n)'));
}

export function sqliteDb(): Db & { raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  for (const stmt of translate(readFileSync('db/migrations/0001_core.sql', 'utf8'))) raw.exec(stmt);
  const fix = (sql: string) => sql.replace(/LEAST\(/g, 'MIN(').replace(/LIKE \?/g, "LIKE ? ESCAPE '\\'");
  const base = {
    rows: async (sql: string, p: unknown[] = []) => raw.prepare(fix(sql)).all(...(p as never[])) as any[],
    run: async (sql: string, p: unknown[] = []) => Number(raw.prepare(fix(sql)).run(...(p as never[])).changes),
  };
  return { ...base, raw, async tx(fn) {
    raw.exec('BEGIN');
    try { const out = await fn(base); raw.exec('COMMIT'); return out; } catch (e) { raw.exec('ROLLBACK'); throw e; }
  } } as Db & { raw: DatabaseSync };
}

export function fakeR2(): R2Like & { store: Map<string, { bytes: ArrayBuffer; type?: string }> } {
  const store = new Map<string, { bytes: ArrayBuffer; type?: string }>();
  return { store,
    async put(k, v, o) { store.set(k, { bytes: v, type: o?.httpMetadata?.contentType }); },
    async get(k) { const o = store.get(k); return o ? { body: new Response(o.bytes).body!, size: o.bytes.byteLength } : null; },
    async delete(k) { store.delete(k); } };
}
export const PEPPER = 'test-pepper';
export const testEnv = (): Env => ({ TIDB_DATABASE_URL: 'unused', FILES: fakeR2(), PASSWORD_PEPPER: PEPPER, ENVIRONMENT: 'development', APP_ORIGIN: 'http://localhost:8787' });
export const PASSWORD = 'correct horse battery';

/** Two clinics. Fast PBKDF2 is NOT used: the real hash runs once and its result is reused for every seeded person. */
export async function seed(db: Db & { raw: DatabaseSync }) {
  const hash = await hashPassword(PASSWORD, PEPPER), now = toDb(new Date());
  const clinics = { A: newId(), B: newId() };
  for (const [k, id] of Object.entries(clinics)) db.raw.prepare('INSERT INTO clinic (id, name, country, timezone, created_at) VALUES (?,?,?,?,?)').run(id, `Clinic ${k}`, 'MA', 'Africa/Casablanca', now);
  const people: Record<string, { id: string; clinicId: string }> = {};
  const add = (key: string, clinicKey: 'A' | 'B', role: string) => {
    const id = newId(); people[key] = { id, clinicId: clinics[clinicKey] };
    db.raw.prepare('INSERT INTO staff (id, clinic_id, email_norm, name, role, password_hash, password_changed_at, created_at) VALUES (?,?,?,?,?,?,?,?)').run(id, clinics[clinicKey], `${key.toLowerCase()}@x.test`, key, role, hash, now, now);
  };
  add('ownerA', 'A', 'owner'); add('dentistA', 'A', 'dentist'); add('receptionA', 'A', 'reception'); add('assistantA', 'A', 'assistant'); add('accountantA', 'A', 'accountant'); add('ownerB', 'B', 'owner'); add('dentistB', 'B', 'dentist');
  const chairA = newId(), chairB = newId();
  db.raw.prepare('INSERT INTO chair (id, clinic_id, name) VALUES (?,?,?)').run(chairA, clinics.A, 'Chair 1');
  db.raw.prepare('INSERT INTO chair (id, clinic_id, name) VALUES (?,?,?)').run(chairB, clinics.B, 'Chair 1');
  return { clinics, people, chairA, chairB };
}
