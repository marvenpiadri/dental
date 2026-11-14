import { connect } from '@tidbcloud/serverless';
import type { Env } from './env';

export type Row = any;
/** What repositories see. SQL stays inside src/worker/repo/*; handlers and services never write SQL. */
export interface Db {
  rows<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Rows affected by an INSERT/UPDATE/DELETE. */
  run(sql: string, params?: unknown[]): Promise<number>;
  /** Interactive transaction (the driver marks these experimental: see docs/architecture-tidb.md). */
  tx<T>(fn: (t: Omit<Db, 'tx'>) => Promise<T>): Promise<T>;
}

// Keep DATETIME/DATE as the strings TiDB sends: they are UTC 'YYYY-MM-DD HH:MM:SS.mmm' and are converted in one place (time.ts).
const decoders = { DATETIME: (v: string) => v, TIMESTAMP: (v: string) => v, DATE: (v: string) => v };

export function connectDb(env: Env): Db {
  const conn = connect({ url: env.TIDB_DATABASE_URL, decoders, fullResult: true });
  const wrap = (x: { execute: (q: string, a?: any[]) => Promise<any> }): Omit<Db, 'tx'> => ({
    rows: async <T>(sql: string, params: unknown[] = []) => ((await x.execute(sql, params as any[])).rows ?? []) as T[],
    run: async (sql, params = []) => (await x.execute(sql, params as any[])).rowsAffected ?? 0,
  });
  return {
    ...wrap(conn),
    async tx(fn) {
      const t = await conn.begin();
      try { const out = await fn(wrap(t)); await t.commit(); return out; } catch (e) { await t.rollback().catch(() => undefined); throw e; }
    },
  };
}
