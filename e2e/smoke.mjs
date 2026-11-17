// Critical-workflow smoke suite. Synthetic data only; each test gets a fresh browser profile (empty IndexedDB).
// Run:  npm start   (port 4200)   then   BASE=http://127.0.0.1:4200 npm run e2e
// Needs the `playwright` package and a Chromium (not a dependency of the app; `npm i -D playwright` if missing).
// Unit tests cover the rules; this only checks what a person would do in the browser.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.env.BASE ?? 'http://127.0.0.1:4200';
const ID = /\/patients\/[0-9a-f-]{36}$/;

const browser = await chromium.launch();
const fresh = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.addCookies([{ name: 'dtl-lang', value: 'en', url: BASE }]);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(String(e).slice(0, 200)));
  return { ctx, page };
};
const addPatient = async (page, name, phone) => {
  await page.goto(`${BASE}/patients/new`, { waitUntil: 'networkidle' });
  await page.fill('[name=fullName]', name);
  await page.fill('[name=phone]', phone);
  await page.click('button[type=submit]');
};
const newPatient = async (page, name, phone) => {
  await addPatient(page, name, phone);
  await page.waitForFunction((re) => new RegExp(re).test(location.pathname), ID.source);
  return page.url().split('/').pop();
};
// Wait (up to 5 s) for text to appear instead of sleeping a fixed time; fails with what the page showed.
const shows = async (page, re, what) => {
  try { await page.waitForFunction((src) => new RegExp(src, 'i').test(document.body.innerText), re.source, { timeout: 5000 }); }
  catch { assert.fail(`${what}: ${re} not found in: ${(await page.locator('main').innerText()).slice(0, 300).replace(/\n/g, ' | ')}`); }
};
const tab = (page, name) => page.getByRole('button', { name: new RegExp(`^${name}`) }).click();

const tests = {
  async 'patient gets a file number and an exact duplicate is refused'(page) {
    await newPatient(page, 'Test Patient One', '+212 600 000 201');
    assert.match(await page.locator('body').innerText(), /P-0001/);
    await addPatient(page, 'Test Patient One', '+212 600 000 201');
    await page.waitForTimeout(500);
    assert.doesNotMatch(page.url(), ID, 'duplicate must not be saved');
  },

  async 'a payment and an expense show up in Reports > Today (received, expenses, net)'(page) {
    const id = await newPatient(page, 'Test Patient Two', '+212 600 000 202');
    await page.goto(`${BASE}/patients/${id}/billing`, { waitUntil: 'networkidle' });
    await page.getByLabel('Amount (MAD)').fill('500');
    await page.getByLabel('Amount (MAD)').press('Enter');
    await page.waitForTimeout(500);
    await page.goto(`${BASE}/practice`, { waitUntil: 'networkidle' });
    await tab(page, 'Expenses');
    await page.fill('input[aria-label="What for"]', 'Test Rent');
    await page.fill('input[aria-label^="Amount"]', '200');
    await page.getByRole('button', { name: 'Add' }).click();
    await page.goto(`${BASE}/reports`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Today' }).click();
    await shows(page, /Expenses[\s\S]*200/, 'expenses tile');
    await shows(page, /Received minus expenses[\s\S]*300/, 'net tile');
    await shows(page, /500/, 'money received');
  },

  async 'stock ledger adds up; lab remake needs a reason; equipment goes overdue'(page) {
    await page.goto(`${BASE}/practice`, { waitUntil: 'networkidle' });
    await tab(page, 'Stock');
    await page.fill('input[aria-label="Item"]', 'Test Gloves');
    await page.fill('input[aria-label="In stock"]', '10');
    await page.getByRole('button', { name: 'Add' }).click();
    await page.getByRole('button', { name: 'Used one' }).first().click();
    await page.waitForTimeout(300);
    assert.match(await page.locator('.row', { hasText: 'Test Gloves' }).first().innerText(), /\b9\b/);

    await newPatient(page, 'Test Patient Three', '+212 600 000 203');
    await page.goto(`${BASE}/practice`, { waitUntil: 'networkidle' });
    await tab(page, 'Lab work');
    await page.locator('select[aria-label="Patient"]').selectOption({ label: 'Test Patient Three' });
    await page.fill('input[aria-label^="Work"]', 'Crown');
    await page.getByRole('button', { name: 'Add' }).click();
    await page.locator('select.status').first().selectOption({ label: 'Remake at the lab' });
    const reason = page.locator('input[aria-label="Reason (required)"]');
    await reason.locator('..').locator('button.btn--primary').click();
    await page.waitForTimeout(300);
    assert.ok((await page.locator('[role=alert]').count()) > 0, 'remake without a reason must be refused');
    await reason.fill('Margin open');
    await reason.locator('..').locator('button.btn--primary').click();
    await page.waitForTimeout(300);
    assert.match(await page.locator('select.status').first().inputValue(), /remake/);

    await tab(page, 'Equipment');
    await page.fill('input[aria-label^="Device"]', 'Test Autoclave');
    await page.fill('input[aria-label^="Service every"]', '6');
    await page.locator('input[type=date]').fill('2025-01-10');
    await page.getByRole('button', { name: 'Add' }).click();
    await shows(page, /Service overdue/, 'overdue chip');
  },

  async 'roles: accountant records expenses but not stock; dentist cannot open billing'(page, ctx) {
    const id = await newPatient(page, 'Test Patient Four', '+212 600 000 204');
    await page.goto(`${BASE}/setup/team`, { waitUntil: 'networkidle' });
    for (const role of ['Owner', 'Dentist', 'Accountant']) {
      await page.fill('input[aria-label="Name"]', `Test ${role}`);
      await page.locator('select.role').selectOption({ label: role });
      await page.fill('input[aria-label^="PIN"]', '1234');
      await page.locator('form.row button[type=submit]').last().click();
      await page.waitForTimeout(400);
    }
    const as = async (who) => {
      const p = await ctx.newPage();
      await p.goto(`${BASE}/today`, { waitUntil: 'networkidle' });
      const opts = await p.locator('select option').allInnerTexts();
      await p.locator('select').first().selectOption({ index: opts.findIndex((o) => o.includes(`Test ${who}`)) });
      await p.fill('input[type=password]', '1234');
      await p.click('button[type=submit]');
      await p.waitForTimeout(800);
      return p;
    };
    const acc = await as('Accountant');
    await acc.goto(`${BASE}/practice`, { waitUntil: 'networkidle' });
    await tab(acc, 'Stock');
    await acc.waitForTimeout(500);
    assert.equal(await acc.locator('input[aria-label="Item"]').count(), 0, 'accountant must not get the stock form');
    await tab(acc, 'Expenses');
    await acc.waitForTimeout(500);
    assert.equal(await acc.locator('input[aria-label="What for"]').count(), 1, 'accountant gets the expense form');

    const dent = await as('Dentist');
    await dent.goto(`${BASE}/patients/${id}/billing`, { waitUntil: 'networkidle' });
    await dent.waitForTimeout(400);
    assert.equal(await dent.getByLabel('Amount (MAD)').count(), 0, 'dentist must not see the payment form');
  },

  async 'backup restores into a clean browser profile'(page) {
    await newPatient(page, 'Test Patient Five', '+212 600 000 205');
    await page.goto(`${BASE}/practice`, { waitUntil: 'networkidle' });
    await tab(page, 'Stock');
    await page.fill('input[aria-label="Item"]', 'Test Masks');
    await page.fill('input[aria-label="In stock"]', '50');
    await page.getByRole('button', { name: 'Add' }).click();
    await page.waitForTimeout(300);
    await page.goto(`${BASE}/setup/backup`, { waitUntil: 'networkidle' });
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download backup' }).click()]);
    const file = join(mkdtempSync(join(tmpdir(), 'dtl-')), 'backup.json');
    await dl.saveAs(file);
    assert.ok(JSON.parse(readFileSync(file, 'utf8')).patients.length >= 1);

    const { ctx: other, page: clean } = await fresh();
    await clean.goto(`${BASE}/setup/backup`, { waitUntil: 'networkidle' });
    await clean.locator('input[type=file]').setInputFiles(file);
    await clean.getByRole('button', { name: 'Replace and restore' }).click();
    await clean.waitForTimeout(1200);
    await clean.goto(`${BASE}/patients`, { waitUntil: 'networkidle' });
    assert.match(await clean.locator('body').innerText(), /Test Patient Five/);
    await clean.goto(`${BASE}/practice`, { waitUntil: 'networkidle' });
    await tab(clean, 'Stock');
    await clean.waitForTimeout(500);
    assert.match(await clean.locator('body').innerText(), /Test Masks/);
    await other.close();
  },

  async 'chart: 32 teeth drawn, Escape closes the tooth editor and returns focus'(page) {
    await newPatient(page, 'Test Patient Six', '+212 600 000 206');
    await page.getByRole('link', { name: 'Procedures & chart' }).click();
    await page.waitForTimeout(1500);
    assert.equal(await page.locator('den-tooth-tile button.tile').count() >= 32, true);
    await page.locator('den-tooth-tile button.tile').first().focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1200);
    assert.ok((await page.locator('[role=dialog]').count()) > 0, 'editor opens');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    assert.equal(await page.locator('[role=dialog]').count(), 0, 'editor closes');
    assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'BUTTON');
  },
};

const only = process.argv[2];
let failed = 0;
for (const [name, run] of Object.entries(tests)) {
  if (only && !name.includes(only)) continue;
  const { ctx, page } = await fresh();
  try {
    await run(page, ctx);
    assert.deepEqual(page.errors, [], 'page errors');
    console.log('PASS', name);
  } catch (e) {
    failed++;
    console.log('FAIL', name, '\n    ', String(e.message).split('\n')[0]);
  }
  await ctx.close();
}
await browser.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
