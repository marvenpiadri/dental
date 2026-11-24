# Dontalist product audit — current frontend snapshot

**Updated:** 16 November 2026 (evidence for the latest pass: [audit/README.md](audit/README.md))  
**Repository:** `marvenpiadri/dental`  
**Branch:** `feat/patient-file-acts`

This document is a source-level product inventory, not a release certification. It consolidates the repository audit and the later calendar changes. It does not claim that a fresh local build, full test run or browser acceptance pass was performed by this audit. See [repository-audit-2026-11-10.md](repository-audit-2026-11-10.md) for evidence and limits.

## 1. Product areas represented in the frontend

| Area | Current scope |
|---|---|
| Today | Day dashboard, waiting-room state, upcoming appointments, reminders/recalls and unpaid-balance visibility |
| Calendar | Day/week/month/year views, dentists/chairs, appointment editing, statuses, drag movement, resize/create interactions and waiting room |
| Patients | Search, filters, registration, editing, archive/restore and patient-file navigation |
| Patient file | Overview, odontogram/periodontogram, appointments, acts/treatment plan, billing, quotes, visits, letters, imaging and documents |
| Practice | Tasks, stock, sterilisation, implant traceability, expenses and lab orders |
| Reports | Revenue and payment reporting, including CSV export |
| Settings | Clinic identity, team/roles, schedule, services/billing, messaging, integrations and workspace preferences |
| Public clinic profile | Clinic profile preview and server-rendered public-page/SEO structure; live Google Business Profile synchronisation requires backend/OAuth work |

## 2. Source-confirmed functionality

- Routine dental acts can be recorded from an appointment without selecting a tooth or opening a chart; they link to the appointment and patient treatment plan.
- Planned treatment can be marked done without duplicating the treatment item.
- Calendar event movement uses Angular CDK; custom pointer handling remains for resize, drag-to-create and all-day movement.
- Visit-note corrections preserve prior content in revisions; notes can be voided with a reason.
- Prescription lines support free-text medication entry, basic suggestions, dosage/duration fields and printing. The current static suggestions are not a maintained national medication catalogue.
- Stock has a movement ledger (received, used, wasted, count) with expiry dates and low-stock alerts; no suppliers or purchase orders yet.
- The Practice task list is a simple checklist.
- The clinic store uses IndexedDB. The Angular service worker caches the production app shell/assets.
- Patient file sections include overview, acts/chart, appointments, billing, quotes, visits and documents.

## 3. Remaining validation and product gaps

These are gaps or validation candidates, not automatic instructions to expand scope.

| Area | Current limitation / next check |
|---|---|
| Calendar | Verify CDK movement does not conflict with custom resize/create gestures; test invalid-drop rollback, overlap rules, keyboard use and reduced motion |
| End-to-end clinic day | Run a complete patient → appointment → visit → act → invoice → payment workflow in the browser |
| Printing | Inspect real print/PDF output for invoices, quotes, certificates/referrals and other clinic documents, not only generated HTML |
| Accessibility | Complete keyboard, focus, labels and screen-reader review |
| Themes/locales | Check all routes in light/dark and EN/FR; Arabic needs a separate RTL and terminology pass before being offered |
| Inventory | Current implementation is basic; do not expand into ERP without validated clinic demand |
| Tasks | Current implementation is a checklist; add assignment/workflow complexity only if required |
| Public clinic data | Google Business Profile OAuth/synchronisation and server-readable publishing require backend work |
| Backend | Authentication, server-side authorisation, tenant isolation, PostgreSQL persistence, multi-device sync, secure file storage and server backups remain deferred |


## 3b. Roadmap (single, ordered; update this list, do not start another)

Order follows dependencies. Items marked done were verified (see audit/README.md); the rest are open.

1. **Verify before building**: Scenarios A (visit start), B (invoice, partial payments, receipt), E (stock, as ledger), D (lab, status history), F (roles, UI side) and G (backup/restore) were run in the browser; seven workflows are now repeatable in `e2e/smoke.mjs`. Scenario A is now complete through note and completion (F16 fixed). Chart *Initial* view fixed (F17). Still to run: B's quote path, C (recall and calendar). *In progress.*
2. **Patient file**: identity fields and file number *done*; wider duplicate hints (same phone or email, non-blocking; `similarPatients`, unit- and e2e-tested) *done*. Patient timeline now includes invoices, letters and prescriptions, with show-older paging *done*; patient merge (Merge duplicate on the patient file; `mergePatientRecords` unit-tested, e2e-tested with a letter moving across; moves records, appointments and attached files, deletes the duplicate, cannot be undone) *done*. Not checked: merge with real invoices/payments/attached files in a browser.
3. **Billing and reports**: refunds through credit notes (decided 2026-11-19: a refund is recorded on the credit note, capped at what was paid on the cancelled invoice, and comes off "paid"; no negative payments; unit-tested and in the visit e2e), payment-to-invoice default, overpayment guard, receipt legal block, invoice due date (clinic payment term in Settings → services, `Invoice.dueOn`, printed under the title; unit-tested, setting persistence e2e-tested, printed due line not looked at in a browser), Reports tiles for expenses/net and a *Today* period, unpaid-balances card *done*. ~~Cash closing~~ **superseded** by Reports → Today (cash/card/etc. by method, expenses, net); no signed closing record is kept. Expense categories (`Expense.category`, picker in Practice → Expenses, 'Spending by category' in Reports; unit- and e2e-tested) *done*. Still open: refunds (needs a product decision: negative payment vs credit note). Overdue-invoices card in Reports (`overdueInvoices`, unit-tested; the card itself not yet seen in a browser with data) *done*. *Partly open.*
4. **Calendar**: waiting list *done* (button on the patient file, card on Today with Book and Remove; hidden while the patient has a future appointment; e2e-tested; no per-entry preference note yet). Holiday/closure check *done*: booking on a closure day (Setup → clinic profile) warns, never blocks (`closureOn`; unit- and e2e-tested); the working-hours warning already existed. (Default booking time *done*.) *Open.*
5. **Practice**: stock ledger, equipment register, lab history/cost/remake *done*. Equipment service log (note per service, last three shown; e2e-tested) *done*. Suppliers kept clinic-sized *done*: `StockItem.supplier`, a 'To reorder' list grouped by supplier with suggested quantities and a Copy order button (unit- and e2e-tested; the copy-to-clipboard itself not clicked in a browser; the app sends nothing, and there is no purchase-order document or supplier directory by design). Lab attachments *done*: a paperclip on each open lab order stores a scan or photo as a patient document tagged `labOrderId` (same type and size rules as Documents; shown under the order and in the patient's documents; e2e-tested; the file itself not opened in a browser). Keep it clinic-sized, not an ERP.
6. **Documents**: periodontal table in the clinical report *done*; letter and the chart report were rendered to A4 PDF in EN and FR and look clean *done*. Invoice (with the due line) and receipt also rendered to A4 PDF in EN and FR and look clean; observation, not changed: invoice line names are frozen in the language used when the invoice was issued (a FR print of an EN-issued invoice shows 'Filling'). Quote and the visit-note prescription also rendered to A4 PDF in EN and FR with logo and clinic name (fixed: the prescription list showed both a bullet and a number); observation: a clinic with no dentist prints the placeholder 'New dentist', and act names stay in the language they were recorded in. The standalone prescription module print (rx page) also rendered to A4 in EN and FR (logo, clinic name, signature and stamp boxes; the sheet has no 'Prescription' title, a design choice left as is). The periodontal table with real probing data was rendered to A4 PDF in EN (table, classification and summary correct; fixed: the findings list repeated raw 'Pd MB 3 … Gm , Bop' lines, now left to the periodontal section). Open: the same print in FR was not looked at.
7. ~~Permissions test~~ **merged into 10**: the UI side is done for all six roles (Practice gating fixed, F15; route fallbacks checked; role grid unit-tested). What remains is server enforcement, which only the backend can provide.
8. ~~Backups~~ **done**: export, validate, restore into a clean profile (browser test), weekly reminder. Remaining nit: the restore dialog counts only patients and appointments.
9. **Accessibility and layout**: tab strip fixed; keyboard/focus pass (names, focus rings, Escape and focus return) *done*. Open: screen-reader pass, 200% zoom, contrast measurement. *Partly open.*
10. **Backend contracts** (separate repo `dental-api`): auth/session, tenant isolation, appointments, patients, billing, clinical, documents and prescriptions exist there and are tested only against a SQLite stand-in; every permission check above must be repeated server-side. The frontend still persists to IndexedDB; the repository layer that swaps it is not built. Real-TiDB verification is blocked from the sandbox.

## 4. Product boundaries

- Desktop and tablet are the V1 targets; a separate phone app can come later.
- One clinic/location per account.
- The only chart modules are odontogram and periodontogram.
- Routine acts must remain recordable without chart/tooth selection.
- Payments are offline/manual; no online payment processing.
- Do not add separate endodontic, orthodontic, implant, occlusion, TMJ or soft-tissue chart modules.
- Do not turn the Practice stock list into a full pharmacy or purchasing ERP.

## 5. Country strategy

Dontalist is international by architecture and Morocco-first in delivery. The universal CRM remains shared; country-specific capabilities are delivered through country packs.

CNSS, CNOPS and insurer reimbursement workflows are **out of scope**. Do not add insurer-specific forms, PDF templates, claim or reimbursement tracking, dedicated chart annotations, or insurer-specific settings. Ordinary treatment billing and manually recorded payments remain in scope.

See [product-direction-country-packs.md](product-direction-country-packs.md).

## 6. Work split

**Good independent work before backend:** documentation reconciliation, product requirements, country-pack definitions, data-source/licence checks, document inventories, acceptance criteria and scope decisions.

**Keep with Claude:** complex Angular changes, local browser validation, visual regression, test/build execution, SSR verification and difficult debugging.

No statement in this document should be interpreted as a claim that a backend or country-specific insurance integration already exists.


**Decisions 2026-11-19:** quote path (B) stays pending, since no document defines it; recalls (C) stay as the existing Today list, no new recall system. Known flaky: the merge e2e failed once in a full run and passed on every other run.

**2026-11-19 closing checks.** Periodontal data no longer prints on the A4 chart report (decision: not needed; the on-screen chart is unchanged). Accessibility: axe-core (WCAG 2.0/2.1 A and AA, which includes colour contrast) run over 11 screens at 100% and at 200% zoom (720x450 viewport): 0 violations after fixing the calendar scroll area (keyboard focus), the reports scroll area (focus and label) and the clinic-profile problem list (list role). Not done: a real screen-reader pass (axe checks names and roles, not how a reader sounds), other themes. Browser-checked and now in e2e: copy order to clipboard, lab attachment opens, due line and overdue card with a 30-day clock jump.


## 3c. Connecting the frontend to the backend (decided 2026-11-20; replaces IndexedDB)

**Decisions.** The backend stays Hono on Cloudflare Workers (Fastify needs Node and cannot run on Workers; Hono is already built, 102 logic tests). Frontend on Pages, backend on its own Worker; they must share a site (for example `app.example.ma` and `api.example.ma`) so the login cookie works, or the cookie must be SameSite=None. Neon PostgreSQL Cloud for data, R2 bucket `mokiko` for files through a Worker binding (the S3 keys are not needed). IndexedDB and offline use are dropped at the end (S8). Test accounts are used for now and switched to the real Cloudflare account later.

**Database changed 2026-11-20: Neon PostgreSQL (`pg` through Hyperdrive) replaces TiDB; see the backend's `docs/postgres-architecture.md`.** Backend status on PostgreSQL: auth, staff, patients, dentists, chairs and appointments are built and tested on a real PostgreSQL (backend P1-P2); everything else below is being re-ported (P3-P6). IDs are time-ordered UUIDv7. The frontend side of every stage is still to do.

**What existed in the TiDB-era backend (now being re-ported):** auth, team, patients, appointments, medical history, chart, exams, treatment plan, documents/files, invoices, payments, credit notes, prescriptions (module only). **Missing in the backend** (the frontend has them): clinic profile and closures, dentists and chairs endpoints, services/prices, insurance, prescription templates, letters, expenses, equipment, stock and suppliers, lab orders and lab files, tooth files, waiting list, recalls, reports (server-side aggregates), refunds on credit notes, patient merge, settings.

**Hard part.** The frontend stores load whole data sets in memory and keep one rich record per patient. The backend splits that over 22 tables and requires pagination and date ranges, so each screen's store must change to on-demand loading, not just swap its storage.

| Stage | Scope | Done |
|---|---|---|
| S1 | API client, environment URLs, CORS and cookies, login screen and session, route guard | partly: client, `/config.json` address, email/password sign-in, session, guard and sign-out are built and tested against a MOCK API (unit + e2e). Not done: a real login against the deployed Worker and Neon; static output for Pages (the build is still SSR); Setup > Team still edits the local PIN team until S3 |
| S2 | Patients: paginated list, create, edit, archive, merge | partly: with an API address set, the list (search, alert and archived filters, keyset paging), create, edit, archive/restore, merge and duplicate lookup all go to the server (unit tests against a mock API). Not done: the "today" filter, sort by newest and next/last visit columns (need appointments, S3); the medical block of the patient form is not sent until S4; other screens still read the cached patients until their own stage |
| S3 | Clinic profile, dentists, chairs, appointments and calendar (date-range queries), waiting list | yes, with an API address set (mock-API unit tests): clinic settings/profile/closures, dentists, chairs (server assigns new ids), appointments loaded for the visible calendar range / today / one patient (newest 50), book, move, edit and status with the server revision (a taken slot or stale edit shows as a conflict), waiting list. Not done: dentist photos (S6), appointment history list, reminders sent log (S4+), the calendar does not refresh by itself when a colleague books |
| S4 | Medical history, odontogram chart, exams, treatment plan | yes, with an API address set (mock-API unit tests): a patient file reads its own sections when opened (medical, chart, plan up to 500 items, newest 10 exams and the first); the chart is saved as changed teeth only, with revisions (a colleague's change to the same tooth is refused and the chart re-read); recording work saves chart, baseline and work exams, and the plan item with its own day in that order; the patient form keeps the medical history safe (waits for it, sends the version). Not done: perio measurements are only editable where the chart is not read-only (nothing in the app wires that yet), visit notes and quotes (S6), chart restore and history screens, more than 10 exams per file |
| S5 | Invoices, payments, credit notes, refunds | yes (server mode) — issue, cancel, pay, void, refund go through the API and the section is re-read after; newest 200 invoices / 400 payments loaded. Not yet: receipt numbers come from the payment id, no paging UI for older history |
| S6 | Documents, tooth files and lab files on R2, letters, prescriptions and templates | no |
| S7 | Practice (expenses, equipment, stock, suppliers, lab orders), services and prices, insurance, reports | no |
| S8 | Remove IndexedDB and local seed; server seed script for demo data | no |

Each stage: backend endpoints and tests first, then the frontend swap, then a browser check against a running backend. Nothing is marked done until it ran against a real PostgreSQL.

**Domains (decided 2026-11-20).** Live: `app.dontalist.com` (Pages) and `api.dontalist.com` (Worker), the same site, so the host-only Lax cookie works with `COOKIE_SAMESITE=Lax`, `CORS_ORIGINS=https://app.dontalist.com`. Testing before the domain is set up (`*.pages.dev` + `*.workers.dev` are different sites): `COOKIE_SAMESITE=None`, `CORS_ORIGINS=https://<project>.pages.dev`; Safari blocks such cookies, so test in Chrome. The API address is set per environment in `public/config.json` (`{"apiUrl":"https://api.dontalist.com"}`); empty means local mode.
