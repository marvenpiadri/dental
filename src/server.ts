import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import { loadPublicClinics, siteOrigin } from './public-source.server';
import { importLink, rateLimited } from './maps-link.server';
import { isLive } from './app/denteus/rules/public-record';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

/**
 * Example Express Rest API endpoints can be defined here.
 * Uncomment and define endpoints as necessary.
 *
 * Example:
 * ```ts
 * app.get('/api/{*splat}', (req, res) => {
 *   // Handle API request
 * });
 * ```
 */

/** Search engines: the app is closed to them, live clinic pages are open, and the sitemap lists exactly the live clinics. */
app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /clinics/\nDisallow: /today\nDisallow: /calendar\nDisallow: /patients\nDisallow: /practice\nDisallow: /reports\nDisallow: /setup\nDisallow: /preview\n\nSitemap: ${siteOrigin()}/sitemap.xml\n`);
});
app.get('/sitemap.xml', async (_req, res) => {
  const urls = (await loadPublicClinics()).filter(isLive).map((r) => `  <url><loc>${siteOrigin()}${r.path}</loc></url>`).join('\n');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
});
/** Reads a pasted Google Maps link for the clinic profile form. Stateless: nothing is stored on the server. */
app.get('/api/maps-link', async (req, res) => {
  if (rateLimited(req.ip ?? 'unknown')) { res.status(429).json({ error: 'rate' }); return; }
  const raw = typeof req.query['u'] === 'string' ? req.query['u'].slice(0, 2000) : '';
  const lang = req.query['lang'] === 'fr' ? 'fr' : 'en';
  try {
    const result = await importLink(raw, lang);
    result ? res.set('Cache-Control', 'no-store').json(result) : res.status(422).json({ error: 'link' });
  } catch { res.status(502).json({ error: 'google' }); }
});
/** Clinic photographs, decoded from the exported record. Only JPEG data URLs made by the app's own resizer are served. */
app.get('/clinics/:country/:city/:slug/img/:n', async (req, res, next) => {
  const path = `/clinics/${req.params.country}/${req.params.city}/${req.params.slug}`.toLowerCase();
  const clinic = (await loadPublicClinics()).find((r) => isLive(r) && r.path === path);
  const data = req.params.n === 'cover' ? clinic?.cover : clinic?.gallery[Number(req.params.n)];
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(data ?? '');
  if (!match) { next(); return; }
  res.type('image/jpeg').set('Cache-Control', 'public, max-age=3600').send(Buffer.from(match[1], 'base64'));
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
