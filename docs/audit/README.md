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
| F13 | Receipt print has no clinic legal/address block (invoice has one); invoice has no due date | `receipt-html.ts`, `invoice-html.ts`, model | Open |
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
