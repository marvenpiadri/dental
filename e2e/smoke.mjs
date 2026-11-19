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

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGNQSFiAFTEMLQkAAmxIAbLcbYIAAAAASUVORK5CYII=', 'base64');
const tests = {
  async 'patient gets a file number and an exact duplicate is refused'(page) {
    await newPatient(page, 'Test Patient One', '+212 600 000 201');
    assert.match(await page.locator('body').innerText(), /P-0001/);
    await addPatient(page, 'Test Patient One', '+212 600 000 201');
    await page.waitForTimeout(500);
    assert.doesNotMatch(page.url(), ID, 'duplicate must not be saved');
    // Same phone, different name: only a hint, the record can still be saved.
    await page.goto(`${BASE}/patients/new`, { waitUntil: 'networkidle' });
    await page.fill('[name=fullName]', 'Test Relative One');
    await page.fill('[name=phone]', '+212 600 000 201');
    await shows(page, /Same phone or email as Test Patient One/, 'similar-patient hint');
    await page.click('button[type=submit]');
    await page.waitForFunction((re) => new RegExp(re).test(location.pathname), ID.source);
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
    await page.getByLabel('Category').selectOption('rent');
    await page.getByRole('button', { name: 'Add' }).click();
    await page.goto(`${BASE}/reports`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Today' }).click();
    await shows(page, /Expenses[\s\S]*200/, 'expenses tile');
    await shows(page, /Received minus expenses[\s\S]*300/, 'net tile');
    await shows(page, /Spending by category[\s\S]*Rent[\s\S]*200/, 'spending by category');
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
    await page.fill('input[aria-label="Item"]', 'Test Needles');
    await page.fill('input[aria-label="In stock"]', '1');
    await page.fill('input[aria-label="Alert at"]', '4');
    await page.fill('input[aria-label="Supplier"]', 'Test Supplier');
    await page.getByRole('button', { name: 'Add' }).click();
    await shows(page, /To reorder · Test Supplier[\s\S]*Test Needles × 7/, 'reorder suggestion by supplier');

    await newPatient(page, 'Test Patient Three', '+212 600 000 203');
    await page.goto(`${BASE}/practice`, { waitUntil: 'networkidle' });
    await tab(page, 'Lab work');
    await page.locator('select[aria-label="Patient"]').selectOption({ label: 'Test Patient Three' });
    await page.fill('input[aria-label^="Work"]', 'Crown');
    await page.getByRole('button', { name: 'Add' }).click();
    await page.locator('.row', { hasText: 'Crown' }).locator('input[type=file]').setInputFiles({ name: 'test-scan.png', mimeType: 'image/png', buffer: PNG });
    await shows(page, /Files:\s*test-scan\.png/, 'lab file attached');
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
    await page.getByLabel('Service note (optional)').fill('Replaced filter');
    await page.getByRole('button', { name: /Serviced|Mark serviced|Done/i }).first().click();
    await shows(page, /Last services:[\s\S]*Replaced filter/, 'service log');
    assert.equal(await page.getByText('Service overdue').count(), 0, 'no longer overdue after service');
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

  async 'visit: book, arrive, start, record an act, note, complete from Today; charge and visit count show on the file'(page) {
    const id = await newPatient(page, 'Test Patient Seven', '+212 600 000 207');
    await page.goto(`${BASE}/setup/schedule`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Add dentist' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Add chair' }).click();
    await page.waitForTimeout(300);
    await page.goto(`${BASE}/calendar?patient=${id}&book=1`, { waitUntil: 'networkidle' });
    await page.getByRole('dialog').getByRole('button', { name: 'Book appointment' }).click();
    await page.waitForTimeout(600);
    await page.goto(`${BASE}/today`, { waitUntil: 'networkidle' });
    await page.getByText('Test Patient Seven').first().click(); // opens the visit panel in the calendar
    await page.getByRole('button', { name: 'Patient has arrived' }).click();
    await page.getByRole('button', { name: 'Start treatment' }).click();
    await page.getByLabel('Procedure').selectOption({ label: 'Filling' });
    await page.getByLabel('Price').fill('300');
    await page.getByRole('button', { name: 'Record act' }).click();
    await shows(page, /Filling[\s\S]*MAD\s*300/, 'act listed');
    await page.getByRole('button', { name: /Write visit note/ }).click();
    await page.getByLabel('Findings and diagnosis').fill('Test caries');
    await page.getByRole('button', { name: /^Save/ }).first().click();
    await shows(page, /Test caries/, 'note saved');
    await page.goto(`${BASE}/today`, { waitUntil: 'networkidle' });
    await shows(page, /In treatment[\s\S]*Test Patient Seven/, 'in-treatment list on Today');
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Complete visit' }).click();
    await shows(page, /Completed\s*\|?\s*1|COMPLETED\s*1/, 'completed count');
    await page.goto(`${BASE}/patients/${id}`, { waitUntil: 'networkidle' });
    await shows(page, /Remaining\s*MAD\s*300/, 'charge on the file');
    await shows(page, /Completed visits\s*1/, 'completed visits');
    // Refund through a credit note: pay part of the invoice, cancel it, hand the money back.
    await page.goto(`${BASE}/patients/${id}/billing`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Issue invoice/ }).click();
    await page.getByLabel('Amount (MAD)').fill('200');
    await page.getByRole('button', { name: 'Record payment' }).click();
    await shows(page, /Paid\s*MAD\s*200/, 'payment recorded');
    await page.getByRole('button', { name: 'Cancel invoice' }).click();
    await page.getByLabel('Reason (kept in the record)').fill('Test mistake');
    await page.getByRole('button', { name: 'Cancel and issue credit note' }).click();
    await page.getByRole('button', { name: /Refund MAD\s*200/ }).click();
    await page.getByRole('button', { name: 'Record refund' }).click();
    await shows(page, /Refunded MAD\s*200/, 'refund on the credit note');
    await shows(page, /Paid\s*MAD\s*0/, 'refund comes off paid');
    await page.goto(`${BASE}/patients/${id}/billing`, { waitUntil: 'networkidle' });
    await shows(page, /Refunded MAD\s*200/, 'refund survives reload');
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

  async 'chart: 32 teeth drawn, Escape closes the editor, Initial becomes available after the first procedure'(page) {
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
    // Initial is a true baseline: unavailable before any work, available after the first procedure is recorded.
    const initial = page.getByRole('button', { name: /^Initial/ });
    assert.equal(await initial.isEnabled(), false, 'Initial disabled before any work');
    await page.locator('den-tooth-tile button.tile').nth(5).click();
    await page.waitForTimeout(600);
    await page.locator('button').filter({ hasText: 'Add procedure' }).last().click();
    await page.getByRole('button', { name: 'Save procedure' }).click();
    await page.waitForTimeout(800);
    assert.equal(await initial.isEnabled(), true, 'Initial enabled after the first procedure');
  },
  async 'letter: pre-filled template, edit after saving, prints with the responsibility line'(page, ctx) {
    const id = await newPatient(page, 'Test Patient Eight', '+212 600 000 208');
    await page.goto(`${BASE}/patients/${id}/visits`, { waitUntil: 'networkidle' });
    const text = page.getByLabel('Text', { exact: true });
    await text.waitFor();
    assert.match(await text.inputValue(), /Test Patient Eight/, 'template names the patient');
    await text.fill('Needs two days of rest. Test certificate.');
    await page.getByLabel('Days of rest').fill('2');
    await page.getByRole('button', { name: 'Save document' }).click();
    await shows(page, /2 day\(s\) of rest/, 'letter listed');
    await page.getByRole('button', { name: 'Edit', exact: true }).click({ timeout: 4000 });
    await text.fill('Needs three days of rest. Edited.');
    await page.getByRole('button', { name: 'Save document' }).click();
    const [pop] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', { name: 'Print document' }).click()]);
    await pop.waitForLoadState();
    const html = await pop.content();
    assert.match(html, /Edited\./, 'edited text printed');
    assert.doesNotMatch(html, /Test certificate/, 'old text gone');
    assert.match(html, /dentist is responsible/i, 'responsibility line');
    await pop.close();
    await page.goto(`${BASE}/patients/${id}`, { waitUntil: 'networkidle' });
    await shows(page, /Medical certificate/, 'letter appears in the patient timeline');
  },

  async 'invoice payment term is saved in Settings and survives a reload'(page) {
    await page.goto(`${BASE}/setup/services`, { waitUntil: 'networkidle' });
    const term = page.getByLabel('Payment term (days)');
    await term.fill('15');
    await term.blur();
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.getByLabel('Payment term (days)').inputValue(), '15');
  },

  async 'every paper carries the clinic name and logo, never "Dontalist"'(page, ctx) {
    await page.goto(`${BASE}/setup/clinic`, { waitUntil: 'networkidle' });
    const name = page.getByLabel('Clinic name', { exact: true }).first();
    await name.fill('Test Smile Clinic');
    await name.blur();
    await page.waitForTimeout(600);
    await page.goto(`${BASE}/setup/prescribing`, { waitUntil: 'networkidle' });
    const png = PNG;
    await page.locator('input[type=file]').first().setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png });
    await page.waitForTimeout(800);
    const id = await newPatient(page, 'Test Patient Twelve', '+212 600 000 212');
    await page.goto(`${BASE}/patients/${id}/visits`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Save document' }).click();
    const [pop] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', { name: 'Print document' }).click()]);
    await pop.waitForLoadState();
    const html = await pop.content();
    assert.match(html, /Test Smile Clinic/, 'clinic name printed');
    assert.match(html, /<img src="data:image\/png/, 'clinic logo printed');
    assert.doesNotMatch(html, /Dontalist/, 'no product name on the paper');
    await pop.close();
  },

  async 'booking on a closure day warns that the clinic is closed'(page) {
    const id = await newPatient(page, 'Test Patient Fourteen', '+212 600 000 214');
    await page.goto(`${BASE}/setup/schedule`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Add dentist' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Add chair' }).click();
    await page.waitForTimeout(300);
    await page.goto(`${BASE}/setup/clinic`, { waitUntil: 'networkidle' });
    const today = new Date().toISOString().slice(0, 10);
    await page.getByLabel('Closed from').fill('2020-01-01');
    await page.getByLabel('Until').fill('2099-12-31');
    await page.getByLabel('Reason (optional)').fill('Test holiday');
    await page.getByRole('button', { name: 'Add closure' }).click();
    await page.waitForTimeout(500);
    await page.goto(`${BASE}/calendar?patient=${id}&book=1`, { waitUntil: 'networkidle' });
    await shows(page, /clinic is closed on this day \(Test holiday\)/, 'closure warning');
  },

  async 'merging a duplicate moves its records and removes it'(page) {
    const keep = await newPatient(page, 'Test Patient Keep', '+212 600 000 215');
    const dup = await newPatient(page, 'Test Patient Dup', '+212 600 000 216');
    await page.goto(`${BASE}/patients/${dup}/visits`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Save document' }).click();
    await page.goto(`${BASE}/patients/${keep}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Merge duplicate' }).click();
    await page.locator('[role=alertdialog] select').selectOption(dup);
    await page.getByRole('button', { name: 'Merge into this file' }).click();
    await shows(page, /Medical certificate/, 'duplicate letter now in the kept timeline');
    await page.goto(`${BASE}/patients/${dup}`, { waitUntil: 'networkidle' });
    assert.ok(await page.locator('.fa-user-slash').waitFor({ timeout: 8000 }).then(() => true), 'duplicate file is gone');
  },

  async 'waiting list: add from the file, shown on Today, removed'(page) {
    const id = await newPatient(page, 'Test Patient Wait', '+212 600 000 217');
    await page.goto(`${BASE}/patients/${id}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Add to waiting list' }).click();
    await page.goto(`${BASE}/today`, { waitUntil: 'networkidle' });
    await shows(page, /Waiting list[\s\S]*Test Patient Wait/, 'on Today');
    await page.getByRole('button', { name: 'Remove from waiting list' }).first().click();
    await page.waitForTimeout(400);
    assert.equal(await page.getByText('Test Patient Wait').count(), 0, 'removed from Today');
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
