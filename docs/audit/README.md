# Audit pass of 16 November 2026

Evidence for `product-audit.md` (the single roadmap). Everything here was run in this pass unless marked **not checked**.

## Baseline
| Check | Result |
|---|---|
| `ng build --configuration development` | Passes |
| `ng test --watch=false` | 71 files, 611 tests pass (609 before this pass, +2 added) |
| Browser sweep (Chromium, empty clinic, synthetic data only) | 9 routes x 4 setups (light/dark EN 1440, light FR 1440, light EN 820) = 36 captures. No console errors, no horizontal overflow |

Screenshots are in `docs/audit/screenshots/<module>/<route>__<theme>-<lang>-<width>.png`. They show the empty state of each section; populated screens and dialogs are **not yet captured**.

## Verified findings (code or browser)
| # | Finding | Evidence | Status |
|---|---|---|---|
| F1 | Patient file had no address, emergency contact, preferred language, referral source or file number | `patients/patient-form` screenshot before; model had only name/phone/email/birth/sex/country/city | **Fixed** (below) |
| F2 | Duplicate detection only matches same name AND same phone; no merge | `patient-rules.ts` `validatePatient`; no merge code | Open |
| F3 | Stock was quantity + minimum only | `practice/practice-rules.ts` (`recordMovement`) | Partly fixed: movement ledger (received/used/wasted/count, reason on counts, no overdraw), expiry chips, unit, history, in backups. Checked in browser (10→9→7, overdraw refused). Still open: suppliers, purchase orders, batch numbers |
| F4 | Lab orders have 3 statuses (sent, ready, fitted); no event history, remake, cancel reason, attachments, cost | `LAB_STATUSES` | Open |
| F5 | No refunds, no cash closing, no expense categories report | grep: no refund code | Open |
| F6 | No audit trail of who changed what | grep: none | Open (needs backend identity) |
| F7 | No periodontal report print; no waiting list (a free-slot search does exist in the booking dialog) | grep, booking screenshot | Open |
| F8 | Tab strip on the patient profile was clipped at 1440 px ("Imaging & fi...") | before: `patients/profile-after-identity-fields…`; after: `clinical/chart-empty…` | **Fixed**: all 9 tabs fit at 1440 (EN, FR) and 1280 (EN) |
| F10 | Booking dialog proposed 05:30 (before opening); the booked appointment sat above the visible grid | `calendar/booking-dialog`, `calendar/day-with-appointment` | **Fixed**: default start is never before opening or past the last slot (`defaultStartMin`, 4 tests) |
| F14 | Today's waiting room had no action: staff had to open the calendar to start treatment | `dashboard/today-with-waiting-patient` | **Fixed**: "Start treatment" button (needs `appointments.edit`), same store transition as the calendar |
| F11 | Payments defaulted to "Advance / on account" even with an open invoice, so the patient balance reached MAD 0 while the invoice still read "Unpaid · MAD 400 left" | Browser run: 2 payments, invoice stayed Unpaid | **Fixed**: default is now the oldest open invoice (Advance stays selectable) |
| F12 | A payment larger than the invoice's remaining amount was accepted and the excess disappeared into "Paid" | Code: `billing.component.ts add()` had no check | **Fixed**: blocked with a message offering an advance |
| F13 | Receipt print has no clinic legal/address block (invoice has one); invoice has no due date | `receipt-html.ts`, `invoice-html.ts`, model | Receipt **fixed** (legal block from Settings, unit-tested, escaped; not re-printed to PDF this round). Invoice due date still open (needs a payment-terms field) |
| F9 | File number was only visible in the Details card, below the fold | same screenshot | **Fixed** |

## Fixed in this pass
- Patient identity fields: address, emergency contact name and phone (phone validated like the main phone), preferred language (en/fr), referral source, and an automatic file number `P-0001` (one above the highest in use, never reused, kept on edit). EN and FR strings added. Files: `models/dental.models.ts`, `patients/patient-rules.ts`, `patients/patient-form.component.*`, `patients/patient-profile.component.html`, `services/dental-store.service.ts`, `core/i18n/{en,fr}.ts`.
- Browser-verified: validation error on a bad emergency phone, save, profile shows the fields, `P-0001` then `P-0002`, duplicate (same name and phone, different case/format) blocked, data survives a reload (IndexedDB).
- Tests: `patient-rules.spec.ts` (+2: numbering, emergency-phone validation).
- Older patients have no file number (no back-fill). Not decided: whether to assign one lazily on first open.

## Workflows run in the browser (synthetic data)
- **Scenario A, partly**: register patient -> add dentist and chair -> book (default time in hours) -> arrived -> waiting room on Today -> start treatment from Today -> calendar panel offers Complete visit and Write visit note. Not run: exam, odontogram edits beyond one procedure, visit note, completing the visit, patient history review.
- **Scenario B, mostly**: open the chart, select tooth 16, add a Filling at MAD 400 marked Done -> billing shows it charged -> issue invoice FA-2026-0001 -> pay 150 (invoice Partly paid, MAD 250 left) -> try 300 (blocked) -> pay 250 (invoice Paid, balance 0) -> invoice and receipt print. PDFs and screenshots: `docs/audit/prints/`. Not run: quote -> acceptance -> invoice, reports reflecting the payments, voiding a payment, credit note.
- Print checks were done with an unconfigured clinic, so the clinic name shows the fallback "Dontalist"; branding with a configured clinic is **not verified**.

## Not checked in this pass
Periodontogram behaviour, reports, Scenarios C-G, French print output, role-by-role permission tests, backup then restore, accessibility audit, FR text review of every screen. The earlier docs claim several of these were verified on 10 November; this pass did not re-verify them.

**Lab work (F-lab):** orders now carry a cost and an append-only status history (day, who, reason). 'Remake at the lab' and 'Cancelled' need a reason; fitted and cancelled orders are closed. Checked in browser (remake without reason refused, then logged). Not done: attachments, lab directory, cost in reports.

**Equipment register:** Practice → Equipment lists devices with serial, place, service interval and last service; next-due date is computed (month-end safe), chips show soon/overdue, a dot flags the tab, 'Serviced today' resets it. Included in backups. Checked in browser. Not done: per-service log with technician/cost, reminders.

**Scenario F, roles (run in browser, 5 synthetic staff + owner):**
- Routes: reports and setup redirect roles without access; the patient file hides tabs by permission and a typed clinical or payments URL falls back to Overview (checked for admin, dentist, assistant, reception, accountant).
- **F15 (fixed):** the Practice screen did not check permissions, so a view-only accountant could add or delete stock, lab orders, equipment and tasks. Forms, status changes, movements and delete buttons are now gated (add = `practice.create`, delete = `practice.edit`, expenses = `billing.create`/`billing.edit`, tasks = `tasks.*`). Counted per role in the browser; correction: the billing page's URL id is `billing` (my first probe used a non-existent `payments`, so I re-ran with the real ids `acts`, `billing`, `rx`, `visits`: clinical pages fall back to Activity for admin, reception and accountant, billing falls back for dentist and assistant); role grid locked in `auth-rules.spec.ts`.
- Not enforced by anything but the browser: all of this is UI-side. The server must repeat every check (backend contract in `docs/architecture.md`); anyone with the browser database can bypass it today.
- Not checked: French, keyboard-only sign-in, PIN lockout.

**Scenario G, backup and restore (browser, synthetic data):** exported a clinic with a patient, a stock item with two movements and a device; opened a fresh browser profile (empty database), restored the file; the patient, the stock history (+50, −1 → 49) and the device came back. No page errors. Gaps: the confirm dialog counts only patients and appointments, though stock, lab and equipment are replaced too; no test of a damaged or newer file in the browser (covered by `backup.spec.ts`); backups are only as good as the person remembering to download them (no reminder, no scheduled copy). Documents (files) were not part of this run.

**Backup reminder:** Today shows a notice (owner/admin, i.e. `settings.view`) when the clinic has patients and no backup was downloaded in the last 7 days; the Settings export records the day. Checked in browser (hidden on an empty clinic, shown with a patient, hidden after a download). It proves a file was created, not that it was kept safe.

**Reports:** added Expenses and Received-minus-expenses tiles (period expenses from Practice → Expenses; boundary days unit-tested). Checked in browser. Still missing: receivables (unpaid balances), per-act revenue, lab cost, CSV of expenses, comparison with the previous period.

**Reports, receivables:** a card lists the biggest unpaid balances (links to the patient's Billing) with the clinic-wide total; archived and prepaid patients excluded; unit-tested. Not screenshot-checked.
