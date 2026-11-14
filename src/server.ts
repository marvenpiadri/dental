import { AngularAppEngine } from '@angular/ssr';
import { connectDb } from './worker/db';
import type { Env, SsrContext } from './worker/env';
import { handleApi } from './worker/router';
import { authenticate, view } from './worker/services/auth';
import { json } from './worker/http';
import { loadPublicClinics, siteOrigin } from './public-source.server';
import { importLink, rateLimited } from './maps-link.server';
import { isLive } from './app/denteus/rules/public-record';

/**
 * Cloudflare Worker entry. One Worker serves the API (/api/v1/*), the small server-only routes below and Angular SSR;
 * static files are served by the assets binding before this code runs. No Node server, no Express, no process.env.
 */
const angular = new AngularAppEngine();
const APP_PREFIXES = ['/today', '/calendar', '/patients', '/practice', '/reports', '/setup', '/preview'];
const cookiePresent = (req: Request): boolean => /(?:^|;\s*)(?:__Host-)?dl_session=/.test(req.headers.get('cookie') ?? '');

const text = (body: string, type: string, extra: HeadersInit = {}): Response => new Response(body, { headers: { 'Content-Type': `${type}; charset=utf-8`, ...extra } });

async function serverRoute(req: Request, env: Env, url: URL): Promise<Response | null> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return null;
  const db = connectDb(env);
  if (url.pathname === '/healthz') {
    // Liveness is the Worker answering. `?deep=1` also asks the database, so a platform check can tell "up" from "up but cannot reach TiDB".
    if (url.searchParams.get('deep') !== '1') return json({ status: 'ok' });
    try { await db.rows('SELECT 1 AS ok'); return json({ status: 'ok', database: 'ok' }); } catch { return json({ status: 'degraded', database: 'unreachable' }, 503); }
  }
  if (url.pathname === '/robots.txt') {
    return text(`User-agent: *\nAllow: /clinics/\n${[...APP_PREFIXES, '/login'].map((p) => `Disallow: ${p}`).join('\n')}\n\nSitemap: ${siteOrigin(env)}/sitemap.xml\n`, 'text/plain');
  }
  if (url.pathname === '/sitemap.xml') {
    const urls = (await loadPublicClinics(db)).filter(isLive).map((r) => `  <url><loc>${siteOrigin(env)}${r.path}</loc></url>`).join('\n');
    return text(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, 'application/xml');
  }
  const img = /^\/clinics\/([^/]+)\/([^/]+)\/([^/]+)\/img\/(cover|\d{1,2})$/.exec(url.pathname);
  if (img) {
    const path = `/clinics/${img[1]}/${img[2]}/${img[3]}`.toLowerCase();
    const clinic = (await loadPublicClinics(db)).find((r) => isLive(r) && r.path === path);
    const data = img[4] === 'cover' ? clinic?.cover : clinic?.gallery[Number(img[4])];
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(data ?? '');
    if (m) return new Response(Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0)), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
  }
  return null;
}

/** Reads a pasted Google Maps link for the clinic profile form. Stateless; needs a signed-in person so the geocoding key cannot be used by strangers. */
async function mapsLink(req: Request, env: Env, url: URL): Promise<Response> {
  if (!cookiePresent(req) || !(await authenticate(req, env, connectDb(env)))) return json({ error: { code: 'unauthenticated', message: 'Sign in first.' } }, 401);
  if (rateLimited(req.headers.get('cf-connecting-ip') ?? 'unknown')) return json({ error: { code: 'rate_limited', message: 'Too many imports.' } }, 429);
  const raw = (url.searchParams.get('u') ?? '').slice(0, 2000), lang = url.searchParams.get('lang') === 'fr' ? 'fr' : 'en';
  try { const r = await importLink(raw, lang, env.GOOGLE_MAPS_SERVER_KEY); return r ? json(r) : json({ error: { code: 'link', message: 'Not a Google Maps link.' } }, 422); }
  catch { return json({ error: { code: 'google', message: 'Google did not answer.' } }, 502); }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    try {
      if (url.pathname === '/api/maps-link') return await mapsLink(req, env, url);
      const api = await handleApi(req, env);
      if (api) return api;
      const direct = await serverRoute(req, env, url);
      if (direct) return direct;

      // Server-side rendering sees the visitor's verified session, read from the cookie before anything renders. No cookie means no database call.
      const db = connectDb(env);
      const session = cookiePresent(req) ? await authenticate(req, env, db).catch(() => null) : null;
      if (env.REQUIRE_LOGIN === '1' && !session && APP_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) {
        return new Response(null, { status: 302, headers: { Location: '/login', 'Cache-Control': 'no-store' } });
      }
      // A database outage must not look like "this clinic does not exist": the page would be cached or de-indexed as a 404.
      let dbDown = false;
      const context: SsrContext = { session: session ? view(session) : null, origin: siteOrigin(env),
        loadClinics: () => loadPublicClinics(db).catch((e) => { dbDown = true; console.error(JSON.stringify({ level: 'error', msg: 'public_clinics', error: String(e) })); return []; }) };
      const res = await angular.handle(req, context);
      if (dbDown) return new Response('Temporarily unavailable.', { status: 503, headers: { 'Retry-After': '30', 'Cache-Control': 'no-store' } });
      if (!res) return new Response('Not found', { status: 404 });
      const out = new Response(res.body, res);
      out.headers.set('X-Content-Type-Options', 'nosniff'); out.headers.set('X-Frame-Options', 'DENY'); out.headers.set('Referrer-Policy', 'same-origin');
      if (session) out.headers.set('Cache-Control', 'private, no-store');
      return out;
    } catch (e) {
      console.error(JSON.stringify({ level: 'error', msg: 'unhandled', path: url.pathname, error: e instanceof Error ? e.message : String(e) }));
      return new Response('Something went wrong.', { status: 500 });
    }
  },
};
