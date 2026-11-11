# Claude handoff — Dontalist, 10 November 2026

This note separates completed low-cost documentation/configuration work from work that needs local execution and deeper implementation.

## ChatGPT completed on feat/patient-file-acts

The following changes are already committed. Do not recreate or overwrite them.

- Added `docs/product-direction-country-packs.md`: universal CRM core, Morocco-first strategy, clinic country/geographic data rules and open source/licence questions. The current document now explicitly excludes insurer reimbursement workflows.
- Updated `docs/product-audit.md` with a current source-level frontend inventory, known gaps and verification limits.
- Updated `docs/repository-audit-2026-11-10.md` to correct the monochrome token finding, record the country-pack decision and clarify the latest branch review.
- Updated `DESIGN.md` to match the current monochrome grid system: strict page/panel grid, flexible control radii, no green primary accent and no blanket calendar descendant radius reset.
- Updated `DENTEUS.md` title/status and calendar notes to reflect the integrated Dontalist app, IndexedDB persistence and current calendar interaction approach while preserving the future scheduling/backend contract.
- Added historical-snapshot notices to `docs/phase-2-checklist.md` and `docs/release-gap-report.md` so their old statuses are not mistaken for current tasks.
- Added country-aware design notes to `docs/domain-model.md`; this is documentation only and does not start backend work.
- Updated `README.md` to link to the current product direction, audit and domain docs.
- Updated `angular.json` SSR allowed hosts from the old Dentaleus domain to `dontalist.com` and `www.dontalist.com`.

These are GitHub commits on `feat/patient-file-acts`. ChatGPT did not run a local build, unit tests or browser checks for these changes.

## Product decisions to preserve

- Universal CRM core, with country-specific capability packs.
- Morocco is the first supported market, but country configuration must stay limited to verified clinic-operational needs.
- CNSS, CNOPS and insurer reimbursement workflows are out of scope. Do not recreate any related forms, PDFs, claims, reimbursements, chart annotations, fields or settings.
- The exact geographic dataset called "2piclock" is not identified yet. Do not import a dataset until its exact URL, coverage, update policy and licence are checked.
- One clinic/location per account; country is a clinic attribute.
- Country, interface language, currency and time zone are separate.
- Desktop/tablet V1; no separate phone app work.
- Keep only odontogram and periodontogram as chart modules.
- No online payment processing.
- Backend/database/authentication and production migration remain deferred until the frontend is accepted.

## Claude's remaining work

Prioritise work that requires running the application locally:

1. Fetch the latest branch and inspect the ChatGPT commits before making changes.
2. Run the production build, unit tests and SSR smoke test.
3. Browser-verify calendar movement, resize, drag-to-create, all-day events, invalid-drop rollback, conflict rules and the appointment-to-act workflow.
4. Verify desktop/tablet, EN/FR, light/dark, reduced motion, keyboard/focus and console errors.
5. Verify the new `dontalist.com` / `www.dontalist.com` SSR allowed-host configuration in the actual deployment and preview environment.
6. Report exactly what passed, what failed, and what remains. Do not claim full release acceptance if any required browser flow was not run.

Do not start country-configuration runtime code or backend migrations yet. The country-configuration document is a product/architecture decision record, not authorisation to begin Phase 3.

## 11 November 2026 — CNSS/CNOPS removal is final

The product owner has removed CNSS, CNOPS and all insurer-reimbursement functionality from Dontalist. Do not recreate it in V1, a Morocco country configuration, a future country pack or Phase 3 unless the product owner explicitly reverses this decision.

Changes already committed on this branch:
- Removed insurer and member-number fields from the patient model, patient form and patient profile.
- Removed the printable care statement intended for patients to submit to insurers, including its UI action, renderer, document kind and translation label.
- Kept ordinary invoices, credit notes, receipts, prescriptions, clinical reports, chart exports and general PDF printing intact.
- Increased the local IndexedDB schema to v4 and added an in-place migration that removes the two retired patient fields without clearing other patient data.
- Older JSON backups are cleaned on import: retired patient fields and the retired document-default key are dropped while the remaining clinic data is preserved.
- Updated product direction, audit, domain model, database handoff and this Claude handoff to keep the scope consistent.

**Local verification is still required; ChatGPT could not run the Angular project or browser in this session.** Run these focused checks, then the normal project build/test commands:
1. Create and edit a patient; confirm no insurer/member-number fields appear.
2. Open a pre-existing v3 IndexedDB clinic; confirm patient records and clinical/billing data remain, while the two retired fields are removed.
3. Import an older JSON backup containing those fields and a `docDefaults.statement`; confirm the patient, clinical records, invoices, payments, appointments, documents and other settings still restore.
4. Confirm invoice, credit-note, receipt, quote, prescription, clinical-report and chart printing still work; there must be no insurer care-statement option.
5. Search active source for `CNSS`, `CNOPS`, `insurer`, `insuranceNumber` and the retired document kind. The intentional migration and compatibility tests are expected to mention the old keys; active patient/billing UI must not.

Do not turn this verification into a broad product audit or add new modules. Backend work remains deferred until the frontend is accepted.
