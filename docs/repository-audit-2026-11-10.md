# Repository audit — 10 November 2026

**Repository:** `marvenpiadri/dental`  
**Branch:** `feat/patient-file-acts`  
**Audited snapshot:** `8c2cd7a375a769e73b15b9b21a73f19b579d120a`  
**Scope:** frontend and product-state reconciliation only. No backend, database, auth-provider, or deployment work.

This is a source/documentation audit. GitHub source was inspected, but no local Angular build, unit-test run, or browser session was available during this audit. Reported test counts and browser checks therefore remain reported evidence, not independently reproduced results.

## 1. Confirmed in source

| Area | Evidence | Finding |
|---|---|---|
| Routine acts from appointments | `src/app/denteus/components/appointment-panel/visit-acts.component.ts`, `visit-acts.ts`, `visit-acts.spec.ts` | Implemented. A routine act can be recorded without a tooth or chart, links to the appointment, flows into the patient plan and existing invoice rules, and has immediate-repeat protection. Planned work can be marked done without duplicating it. |
| Calendar drag | `src/app/calendar/components/time-grid-view/time-grid-view.component.ts`, `.html` | Angular CDK `CdkDrag` is used for event movement. Custom pointer handling remains for resizing, drag-to-create and all-day movement. This is a mixed implementation, not a wholly custom move system. |
| Visit notes and prescriptions | `src/app/denteus/patients/visit-notes.component.ts`, `.html`, `medications.ts`, `prescription-html.ts` | Prescription lines support free-text/drug-name suggestions, dosage, duration and printing. Notes can be linked to an appointment. |
| Visit-note revisions | `visit-notes.component.ts` | Corrections retain the note ID/date and preserve the previous content in revisions. Notes can be voided with a reason. This contradicts older docs claiming edits overwrite notes without history. |
| Stock | `src/app/denteus/practice/practice-rules.ts`, `practice.component.ts`, `.html` | Basic quantity/minimum-threshold tracking and low-stock alerts exist. |
| Tasks | `src/app/denteus/practice/practice.component.ts`, `.html` | A simple checklist exists. |
| Offline app shell | `src/app/app.config.ts`, `angular.json`, `ngsw-config.json` | Angular service worker is registered in production and caches the app shell/assets. Documentation claiming there is no service worker is stale. |
| Local persistence | `src/app/denteus/services/dental-store.service.ts` and clinic database services | The clinic store uses IndexedDB; it is not the old in-memory/localStorage calendar stand-in described in the legacy calendar note. |
| Patient file navigation | `src/app/denteus/patients/profile-pages.ts`, `patient-profile.component.html` | Overview, acts/chart, appointments, billing, quotes, visits, and documents are represented as patient-file sections. |

## 2. Real product gaps and decisions

### Prescription workflow — partially implemented

Current implementation is a general prescription editor inside visit notes. It is not yet a procedure-aware prescription workflow.

Potential next scope, based on clinic feedback:
- Let a dentist start a prescription from a recorded act or visit.
- Offer editable templates by act (for example, extraction may show optional antibiotic, analgesic and mouthwash categories).
- Treat suggestions as optional starting points only. Never auto-prescribe a drug, dose, frequency or duration.
- The dentist must choose and confirm every medication and instruction.
- Save the prescription in the patient file and link it to the relevant visit/act.
- Keep the existing standalone prescription path for cases not associated with a catalog act.

Medication names currently come from a small static list in `medications.ts`; free text is accepted. This is not a validated medication database or a clinical decision-support system.

### Inventory — basic, not full stock management

Current stock records contain a name, quantity and minimum quantity. The code supports quantity nudges and a low-stock indicator.

Not evidenced in the current implementation:
- units and pack conversions;
- suppliers and purchase orders;
- receiving and stock adjustments with a reason;
- stock movement history;
- expiry dates and batch/lot tracking;
- usage/consumption against procedures;
- reorder workflow and inventory valuation.

These are candidate gaps, not a recommendation to build a full ERP module. Confirm what a small dental clinic actually needs before expanding it.

### Tasks — basic checklist, not assigned clinic work

Current tasks are text plus a done flag. Not evidenced: assignee, due date, priority, patient/appointment link, comments, or activity history. Decide whether the current checklist is sufficient for V1 or whether a small assigned follow-up workflow is required.

### Design token review — previous finding superseded

The current `src/styles.css` uses a monochrome primary accent (`#0a0a0a` in light mode and `#fafafa` in dark mode). Green is used only as a semantic success/status colour (`--app-ok`), not as the global primary accent. The earlier claim that the global accent was green was incorrect for the current branch.

## 3. Documentation that needs reconciliation

| File | Stale or conflicting statement |
|---|---|
| `DESIGN.md` | Describes a blanket square-corner rule for all calendar descendants, while current global styles explicitly leave controls/events to their own corner treatment. It also describes a green global accent and rounded free-zone cards that do not match current `src/styles.css` exactly. |
| `DENTEUS.md` | Describes an earlier generic calendar, a stand-in store using in-memory/localStorage, and says patient file/clinical screens are outside the calendar. It is no longer an accurate overview of the integrated Dontalist application. |
| `docs/product-audit.md` | Says visit-note revision history is not built, contradicted by current source. |
| `docs/release-gap-report.md` | Says settings durations/payment methods/notifications are missing and roles are only three coarse permissions; these statements need comparison against the later implementation and current source before being retained. |
| `docs/phase-2-checklist.md` | Says note corrections overwrite without revision history; contradicts current source. Its phone/mobile verification scope should be reconciled with the current desktop/tablet-only V1 decision. |
| `docs/domain-model.md` | Needs prescription/visit revision fields and the current appointment-to-act link reflected accurately. It should remain a future backend design note, not imply a backend exists. |
| `README.md`, `package.json`, `angular.json`, `DENTEUS.md` | Internal project/build naming still includes `calendar-app` and Denteus/Dentaleus-era terminology. `angular.json` still allows `dentaleus.com` and `www.dentaleus.com`. Review these under the branding cleanup step; preserve migration compatibility where required. |

## 4. Calendar implementation assessment

CDK is already used for event movement. The current implementation intentionally keeps custom pointer logic for resize handles, drag-to-create and all-day events. Do not replace all pointer code merely to claim “CDK everywhere”.

The remaining audit should verify:
- CDK movement and custom resize/create never compete for the same pointer gesture;
- invalid drops always restore the original event and explain the conflict;
- chair/dentist assignment and overlap rules survive moves;
- reduced-motion behavior and landing/navigation transitions;
- keyboard operation and focus behavior;
- light/dark contrast and semantic status colors;
- appointment panel and quick-act workflow still work after the calendar styling changes.

## 5. V1 boundaries to preserve

- Desktop and tablet are the V1 targets; a separate phone app can come later.
- Keep one clinic/location per account.
- Keep odontogram and periodontogram as the only chart modules; do not add separate endodontic, orthodontic, implant, occlusion, TMJ or soft-tissue chart modules.
- Routine procedures must remain recordable without opening a chart or selecting a tooth.
- Clinic payment records remain offline/manual; no online payment processing.
- Country-specific insurance workflows are no longer a universal CRM feature. The product owner has reversed the earlier permanent exclusion: relevant CNSS, CNOPS, FAR and other Moroccan mutuelle workflows are now intended for the Morocco country pack only. Exact forms and workflows still require current source and requirements validation before implementation.
- Backend, PostgreSQL, Supabase, Cloudflare API/auth and production migration remain deferred until the frontend is accepted.

## 6. Verification limits and next owners

**Source-confirmed:** the features in section 1 and the implementation gaps in section 2.

**Not independently verified in this audit:** current test count, production build, SSR runtime, browser rendering, role-specific UI behavior, actual print output, and the complete end-to-end clinic-day workflows.

**Good independent work for ChatGPT:** documentation reconciliation, product decision records, country-pack requirements, data-source/licence research, feature inventories and acceptance criteria.

**Keep with Claude:** complex Angular implementation, local browser workflows, visual regression checks, test/build execution, production debugging and changes that require running the application locally.

**Keep with Claude:** complex Angular implementation, local browser workflows, visual regression checks, test/build execution, and difficult debugging.


## 7. Follow-up review of the current branch

A later GitHub comparison found that `feat/patient-file-acts` had advanced **7 commits beyond** Claude's known `ac3fa33` commit. The intervening changes include calendar interaction and presentation updates across the time-grid, event blocks, toolbar, calendar wrapper, appointment mapping, chair-tint utility and its test, plus the calendar polish dependencies/configuration and not-found page. The branch includes the routine appointment-to-act workflow introduced by `ac3fa33`.

The current branch source was also checked for the design tokens: the primary accent is monochrome, and semantic status colours are separate.

This review did not run the Angular build, tests or browser. Do not treat the presence of commits or source files as proof of a fresh end-to-end release verification.

## 8. New product direction recorded after this audit

See [product-direction-country-packs.md](product-direction-country-packs.md). The agreed direction is one universal CRM with a Morocco-first country pack. The clinic's operating country selects applicable country-specific capabilities. Geographic reference data is to be imported locally only after the exact source referred to as "2piclock" is identified and its licence/reuse terms are checked.

The earlier insurance exclusion in this audit is superseded: insurance workflows belong in the Moroccan pack, not in the universal product. Their individual requirements remain to be researched and validated.
