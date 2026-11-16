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
- Basic stock quantity/minimum-threshold tracking and low-stock alerts exist.
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

1. **Verify before building**: run Scenarios A (visit) and B (estimate, invoice, partial payments, receipt) in the browser with synthetic data and capture populated screenshots. Fix what breaks. *Open.*
2. **Patient file**: identity fields and file number *done 16 Nov*; patient merge, wider duplicate hints (same phone, same email), patient timeline. *Open.*
3. **Billing**: refunds, cash closing, expense categories report, overdue invoices view. *Open.*
4. **Calendar**: waiting list; check the default booking time against working hours (booking dialog opened at 05:30 while the grid starts at 07:00); working hours and holidays check. A free-slot search already exists in the booking dialog. *Open.*
5. **Practice**: stock movements (entry, consumption, adjustment, waste) with reasons; suppliers and purchase orders; equipment register and maintenance; lab case status history, remake, cancel reason, cost, attachments. *Open.* Keep it clinic-sized, not an ERP.
6. **Documents**: periodontal report print; check every printed document at A4 in EN and FR. *Open.*
7. **Permissions**: test each of the six roles against every route and action. *Open.*
8. **Backups**: create, validate, restore preview, restore into a clean profile. *Open.*
9. **Accessibility and layout**: clipped patient tab strip, keyboard and focus review. *Open.*
10. **Backend contracts** (separate repo `dental-api`): auth/session, tenant isolation, appointments, patients, billing, clinical, documents and prescriptions exist there and are tested only against a SQLite stand-in. The frontend still persists to IndexedDB; the repository layer that swaps it is not built. Real-TiDB verification is blocked from the sandbox.

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
