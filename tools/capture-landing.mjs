// Regenerates the landing page screenshots from the real app: seeds a demo clinic into a throwaway
// browser profile, then photographs each screen in light and dark, English and French.
// Needs a running production build (npm run build && node dist/calendar-app/server/server.mjs) and Playwright
// installed (npm i -D playwright, or a global install with NODE_PATH set).
//   BASE=http://localhost:4000 OUT=public/landing node tools/capture-landing.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'); // require() honours NODE_PATH for a global install
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4000';
const OUT = process.env.OUT ?? 'public/landing';
mkdirSync(OUT, { recursive: true });

const SCREENS = [
  ['today', '/today'],
  ['calendar', '/calendar'],
  ['patient', '/patients/p0'],
  ['chart', '/patients/p0/acts'],
  ['billing', '/patients/p0/billing'],
  ['doctor', '/doctors/d1'],
  ['reports', '/reports'],
];

/** Runs inside the page: writes a demo clinic straight into the app's IndexedDB. Names are invented. */
async function seed() {
  const db = await new Promise((res) => { const r = indexedDB.open('dental-clinic', 3); r.onsuccess = () => res(r.result); });
  const put = (store, rows) => new Promise((res) => { const t = db.transaction(store, 'readwrite'); rows.forEach((x) => t.objectStore(store).put(x)); t.oncomplete = res; });
  const now = new Date();
  const at = (o, h, m = 0) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + o, h, m);
  await put('locations', [{ id: 'l1', name: 'Cabinet Atlas', code: 'ATL', timezone: 'Africa/Casablanca', active: true, phone: '05 22 00 00 00', address: 'Casablanca' }]);
  await put('dentists', [
    { id: 'd1', name: 'Dr. Salma Idrissi', specialty: 'Dentisterie générale', color: '#2f6fdd', phone: '06 61 00 00 01', email: 'contact@atlas-dental.example', registration: 'N° 4521', hours: { open: '09:00', close: '18:00' } },
    { id: 'd2', name: 'Dr. Karim Berrada', specialty: 'Orthodontie', color: '#b7791f', phone: '06 61 00 00 02', registration: 'N° 3987' },
  ]);
  await put('chairs', [{ id: 'c1', name: 'Fauteuil 1' }, { id: 'c2', name: 'Fauteuil 2' }, { id: 'c3', name: 'Fauteuil 3' }]);
  const names = ['Sara Benali', 'Omar El Fassi', 'Imane Chraibi', 'Yassine Lahlou', 'Khadija Alaoui', 'Hamza Tazi', 'Nadia Bennani', 'Reda Cherkaoui', 'Salma Ouazzani', 'Anas Fassi', 'Meryem Kettani', 'Ilyas Berrada'];
  const iso = (d) => d.toISOString();
  const pay = (id, amount, d, method = 'cash') => ({ id, amount, method, at: iso(d) });
  const done = (id, procedure, price, tooth, d, appt) => ({ id, procedure, price, tooth, status: 'done', date: iso(d).slice(0, 10), doneAt: iso(d), appointmentId: appt });
  await put('patients', names.map((n, i) => ({
    id: 'p' + i, fullName: n, phone: '06 12 34 56 ' + String(10 + i), city: 'Casablanca', sex: i % 2 ? 'male' : 'female', birthDate: `${1975 + i * 3}-0${(i % 9) + 1}-1${i % 9}`, createdAt: iso(at(-90 + i, 9)),
    plan: i === 0 ? [
      done('t1', 'cleaning', 300, undefined, at(-20, 10), 'h0'), done('t2', 'filling', 450, '36', at(-6, 11), 'h1'), done('t3', 'xray', 120, undefined, at(-6, 11), 'h1'),
      { id: 't4', procedure: 'crown', price: 2800, tooth: '46', status: 'planned' }, { id: 't5', procedure: 'root-canal', price: 1500, tooth: '26', status: 'planned' },
    ] : [done('x' + i, 'filling', 400 + i * 20, '1' + (i % 8 + 1), at(-3 - i, 10), 'h' + (i + 1))],
    payments: i === 0 ? [pay('pay1', 300, at(-20, 11)), pay('pay2', 150, at(-6, 12), 'card')] : [pay('px' + i, 400 + i * 20, at(-3 - i, 12))],
  })));
  const ap = (id, p, d, c, o, h, m, mins, status, type = 'consultation') => ({ id, patientId: 'p' + p, dentistId: d, chairId: c, type, status, start: at(o, h, m), end: at(o, h, m + mins), createdAt: now, createdBy: 'demo', history: [], scheduleHistory: [] });
  await put('appointments', [
    ap('h0', 0, 'd1', 'c1', -20, 10, 0, 30, 'completed'), ap('h1', 0, 'd1', 'c1', -6, 11, 0, 45, 'completed'),
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((p) => ap('h' + p, p, p % 2 ? 'd1' : 'd2', 'c' + (1 + (p % 3)), -3 - p, 10, 0, 30, 'completed')),
    ap('a1', 1, 'd1', 'c1', 0, 9, 0, 30, 'completed', 'checkup'), ap('a2', 2, 'd2', 'c2', 0, 9, 0, 45, 'in-progress'), ap('a3', 3, 'd1', 'c1', 0, 10, 0, 60, 'arrived', 'filling'),
    ap('a4', 4, 'd2', 'c2', 0, 10, 30, 30, 'confirmed'), ap('a5', 5, 'd1', 'c3', 0, 11, 0, 45, 'scheduled', 'cleaning'), ap('a6', 6, 'd1', 'c1', 0, 14, 0, 30, 'confirmed'),
    ap('a7', 7, 'd2', 'c3', 0, 15, 0, 60, 'scheduled'), ap('a8', 0, 'd1', 'c1', 1, 10, 0, 60, 'confirmed', 'crown'), ap('a9', 8, 'd2', 'c2', 1, 11, 0, 30, 'scheduled'),
  ]);
}

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const theme of ['light', 'dark']) {
  for (const lang of ['en', 'fr']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addCookies([{ name: 'dtl-theme', value: theme, url: BASE }, { name: 'dtl-lang', value: lang, url: BASE }]);
    const page = await ctx.newPage();
    await page.goto(BASE + '/today'); await page.waitForTimeout(1200);
    await page.evaluate(seed);
    for (const [name, path] of SCREENS) {
      await page.goto(BASE + path);
      await page.waitForTimeout(name === 'chart' ? 6000 : 1800);
      await page.screenshot({ path: `${OUT}/${name}-${theme}-${lang}.jpg`, type: 'jpeg', quality: 82 });
    }
    await ctx.close();
  }
}
await browser.close();
console.log('done');
