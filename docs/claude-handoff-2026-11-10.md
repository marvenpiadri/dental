# Claude handoff — Dontalist, 10 November 2026

This note separates completed low-cost documentation/configuration work from work that needs local execution and deeper implementation.

## ChatGPT completed on feat/patient-file-acts

The following changes are already committed. Do not recreate or overwrite them.

- Added `docs/product-direction-country-packs.md`: universal CRM core, country packs, Morocco-first strategy, clinic country/geographic data rules, Morocco-only insurance scope and open source/licence questions.
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
- Morocco is the first supported market; country-specific insurance workflows are only for Moroccan clinics.
- The previous permanent exclusion of CNSS/CNOPS/FAR has been superseded. Do not expose those workflows as universal features.
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

Do not start country-pack runtime code or backend migrations yet. The country-pack document is a product/architecture decision record, not authorisation to begin Phase 3.
