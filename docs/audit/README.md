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
| F3 | Stock is quantity + minimum only: no movements, reasons, purchase orders, expiry, batch, supplier records | `practice/practice-rules.ts` (`isLow` only) | Open |
| F4 | Lab orders have 3 statuses (sent, ready, fitted); no event history, remake, cancel reason, attachments, cost | `LAB_STATUSES` | Open |
| F5 | No refunds, no cash closing, no expense categories report | grep: no refund code | Open |
| F6 | No audit trail of who changed what | grep: none | Open (needs backend identity) |
| F7 | No periodontal report print; no waiting list (a free-slot search does exist in the booking dialog) | grep, booking screenshot | Open |
| F8 | Tab strip on the patient profile is clipped at 1440 px ("Imaging & fi...") | `patients/profile-after-identity-fields` screenshot | Open |
| F10 | Booking dialog defaulted to 05:30 (sandbox clock ~04:30) while the calendar grid starts at 07:00; **not yet confirmed** whether this is a real defect or only the clock | `calendar/booking-dialog` screenshot | To verify |
| F9 | File number was only visible in the Details card, below the fold | same screenshot | **Fixed** |

## Fixed in this pass
- Patient identity fields: address, emergency contact name and phone (phone validated like the main phone), preferred language (en/fr), referral source, and an automatic file number `P-0001` (one above the highest in use, never reused, kept on edit). EN and FR strings added. Files: `models/dental.models.ts`, `patients/patient-rules.ts`, `patients/patient-form.component.*`, `patients/patient-profile.component.html`, `services/dental-store.service.ts`, `core/i18n/{en,fr}.ts`.
- Browser-verified: validation error on a bad emergency phone, save, profile shows the fields, `P-0001` then `P-0002`, duplicate (same name and phone, different case/format) blocked, data survives a reload (IndexedDB).
- Tests: `patient-rules.spec.ts` (+2: numbering, emergency-phone validation).
- Older patients have no file number (no back-fill). Not decided: whether to assign one lazily on first open.

## Not checked in this pass
Populated screens, dialogs, calendar interactions, odontogram and periodontogram behaviour, invoice/payment workflow end to end (Scenarios A-G), real print/PDF output, role-by-role permission tests, backup then restore, accessibility audit, FR text review of every screen. The earlier docs claim several of these were verified on 10 November; this pass did not re-verify them.
