import type { Ctx, PublicCtx } from './context';
import { ApiError, bad, id, json, oneOf, readJson, str } from '../http';
import * as auth from '../services/auth';
import * as staff from '../repo/staff';
import * as sessions from '../repo/sessions';
import { audit } from '../repo/audit';
import { canManageRole } from '../../app/core/auth/auth-rules';

export async function login(c: PublicCtx) {
  const b = await readJson(c.req, 4096);
  const { session, setCookie } = await auth.login(c.db, c.env, c.req, str(b, 'email', { max: 254 }), str(b, 'password', { max: 200 }));
  return json({ session }, 200, { 'Set-Cookie': setCookie });
}
export const me = async ({ s }: Ctx) => json({ session: auth.view(s) });
export async function logout({ db, env, req, s }: Ctx) {
  await auth.logout(db, s);
  return json({ ok: true }, 200, { 'Set-Cookie': auth.clearCookie(req, env) });
}
export async function password({ db, env, req, s }: Ctx) {
  const b = await readJson(req, 4096);
  await auth.changePassword(db, env, s, str(b, 'current', { max: 200 }), str(b, 'next', { max: 200 }));
  return json({ ok: true });
}
export async function redeem(c: PublicCtx) {
  const b = await readJson(c.req, 4096);
  await auth.redeemReset(c.db, c.env, c.req, str(b, 'token', { max: 64 }), str(b, 'password', { max: 200 }));
  return json({ ok: true });
}

// --- team administration ---------------------------------------------------------------------------------------
export async function team({ db, s }: Ctx) { return json({ items: await staff.listInClinic(db, s.clinicId) }); }

async function target(c: Ctx): Promise<staff.StaffRow> {
  const t = await staff.findInClinic(c.db, c.s.clinicId, id(c.params[0]));
  if (!t) throw new ApiError(404, 'not_found', 'Person not found.');
  if (!canManageRole({ role: c.s.role }, t.role)) throw new ApiError(403, 'forbidden', 'You cannot manage this person.');
  return t;
}
/** Suspending or deactivating takes effect on the very next request: live sessions are revoked in the same transaction. */
export async function setStatus(c: Ctx) {
  const t = await target(c), b = await readJson(c.req, 2048);
  const to = oneOf(b, 'status', ['active', 'suspended', 'deactivated'] as const), reason = str(b, 'reason', { max: 255, optional: true }) ?? null;
  if (to !== 'active' && !reason) throw bad('reason is required to suspend or deactivate.');
  if (t.id === c.s.staffId && to !== 'active') throw new ApiError(409, 'self', 'You cannot suspend or deactivate yourself.');
  if (t.role === 'owner' && to !== 'active' && (await staff.countActiveOwners(c.db, c.s.clinicId, t.id)) === 0) throw new ApiError(409, 'last_owner', 'The clinic needs at least one active owner.');
  await c.db.tx(async (x) => {
    await staff.setStatus(x, c.s.clinicId, t.id, to, reason);
    if (to !== 'active') await sessions.revokeAllFor(x, c.s.clinicId, t.id, `status_${to}`, new Date());
    await audit(x, c.s.clinicId, c.s.staffId, `staff.${to}`, 'staff', t.id, reason ?? undefined);
  });
  return json({ id: t.id, status: to });
}
export async function sessionsRevoke(c: Ctx) {
  const t = await target(c);
  await c.db.tx(async (x) => { await sessions.revokeAllFor(x, c.s.clinicId, t.id, 'revoked_by_admin', new Date()); await audit(x, c.s.clinicId, c.s.staffId, 'staff.sessions_revoked', 'staff', t.id); });
  return json({ ok: true });
}
export async function issueReset(c: Ctx) {
  const t = await target(c);
  return json(await auth.issueReset(c.db, c.s, t.id), 201);
}
export async function auditLog({ db, s, url }: Ctx) {
  const { listAudit } = await import('../repo/audit');
  const before = url.searchParams.get('before'), n = Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, 100);
  return json({ items: await listAudit(db, s.clinicId, before ? id(before) : null, n) });
}
