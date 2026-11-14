import type { Env } from './env';
import { connectDb, type Db } from './db';
import { ApiError, json } from './http';
import { authenticate, checkCsrf, need } from './services/auth';
import type { Permission } from '../app/core/auth/auth-rules';
import type { Ctx, PublicCtx } from './api/context';
import * as a from './api/auth';
import * as p from './api/patients';
import * as ap from './api/appointments';
import * as ex from './api/exams';
import * as f from './api/files';

/** 'public': no session needed (login, reset). 'session': any signed-in person. A Permission: that permission, checked on the server every time. */
type Access = 'public' | 'session' | Permission;
export interface Route { method: string; re: RegExp; access: Access; run: (c: Ctx) => Promise<Response> }
const S = '([0-9A-Za-z]{1,40})';
const route = (method: string, path: string, access: Access, run: (c: Ctx) => Promise<Response>): Route => ({ method, re: new RegExp(`^/api/v1${path}$`), access, run });

/** The whole API surface. Nothing is reachable without naming who may call it. */
export const ROUTES: Route[] = [
  route('POST', '/auth/login', 'public', a.login as never), route('POST', '/auth/reset', 'public', a.redeem as never),
  route('GET', '/auth/me', 'session', a.me), route('POST', '/auth/logout', 'session', a.logout), route('POST', '/auth/password', 'session', a.password),
  route('GET', '/patients', 'patients.view', p.list), route('POST', '/patients', 'patients.create', p.create),
  route('GET', `/patients/${S}`, 'patients.view', p.read), route('PUT', `/patients/${S}`, 'patients.edit', p.update), route('POST', `/patients/${S}/archive`, 'patients.manage', p.archive),
  route('GET', `/patients/${S}/examinations`, 'clinical.view', ex.listForPatient), route('POST', `/patients/${S}/examinations`, 'clinical.create', ex.create),
  route('GET', '/appointments', 'appointments.view', ap.list), route('POST', '/appointments', 'appointments.create', ap.create),
  route('GET', `/appointments/${S}`, 'appointments.view', ap.read), route('PUT', `/appointments/${S}`, 'appointments.edit', ap.update), route('POST', `/appointments/${S}/status`, 'appointments.edit', ap.status),
  route('GET', `/examinations/${S}`, 'clinical.view', ex.read), route('PUT', `/examinations/${S}`, 'clinical.edit', ex.saveDraft), route('POST', `/examinations/${S}/sign`, 'clinical.approve', ex.sign),
  route('POST', `/examinations/${S}/void`, 'clinical.void', ex.voidExam), route('POST', `/examinations/${S}/correct`, 'clinical.edit', ex.correct),
  route('GET', '/files', 'clinical.view', f.list), route('POST', '/files', 'clinical.create', f.upload),
  route('GET', `/files/${S}`, 'clinical.view', f.meta), route('GET', `/files/${S}/content`, 'clinical.view', f.download), route('DELETE', `/files/${S}`, 'clinical.void', f.remove),
  route('GET', '/team', 'team.view', a.team), route('POST', `/team/${S}/status`, 'team.manage', a.setStatus), route('POST', `/team/${S}/sessions/revoke`, 'team.manage', a.sessionsRevoke),
  route('POST', `/team/${S}/reset`, 'team.manage', a.issueReset), route('GET', '/audit', 'settings.manage', a.auditLog),
];

/** Returns a Response for /api/*, or null for everything else so the caller falls through to Angular. */
export async function handleApi(req: Request, env: Env, db?: Db): Promise<Response | null> {
  const url = new URL(req.url);
  if (!url.pathname.startsWith('/api/')) return null;
  try {
    const matches = ROUTES.filter((x) => x.re.test(url.pathname));
    const hit = matches.find((x) => x.method === req.method);
    if (!hit) throw matches.length ? new ApiError(405, 'method_not_allowed', 'Method not allowed.') : new ApiError(404, 'not_found', 'Not found.');
    const conn = db ?? connectDb(env), params = (hit.re.exec(url.pathname) ?? []).slice(1);
    if (hit.access === 'public') return await hit.run({ req, env, db: conn, url, params } as PublicCtx as Ctx);
    const s = await authenticate(req, env, conn);
    if (!s) throw new ApiError(401, 'unauthenticated', 'Sign in first.');
    checkCsrf(req, env, s);
    if (hit.access !== 'session') need(s, hit.access);
    return await hit.run({ req, env, db: conn, url, s, params });
  } catch (e) {
    if (e instanceof ApiError) return json({ error: { code: e.code, message: e.message } }, e.status);
    console.error(JSON.stringify({ level: 'error', msg: 'api_error', path: url.pathname, method: req.method, error: e instanceof Error ? e.message : String(e) }));
    return json({ error: { code: 'internal', message: 'Something went wrong.' } }, 500);
  }
}
