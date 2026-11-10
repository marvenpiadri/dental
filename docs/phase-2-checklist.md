> **Historical snapshot — do not use as the current task list.** This report records an earlier review and contains statuses that have since changed. For the current source-level inventory and known gaps, see [product-audit.md](product-audit.md) and [repository-audit-2026-11-10.md](repository-audit-2026-11-10.md). Current country-pack decisions are in [product-direction-country-packs.md](product-direction-country-packs.md).

# Phase 2 completion checklist

Status classes: **Complete and verified** (workflow run in a browser and covered by tests), **Implemented but needs validation**, **Partially implemented**, **Missing**, **Blocked**.

## Feature status

| Feature | Status | Evidence / gap |
|---|---|---|
| Calendar and appointments (create, move, statuses) | Implemented but needs validation | Existing calendar kept strict; not re-tested end to end this phase. |
| Waiting room (arrival → in chair → done) | Implemented but needs validation | Component and Today screen exist; not run end to end here. |
| Odontogram (grid chart, overlay editor, 3D overlay) | Complete and verified | Screenshots in light, dark, French, phone; 400+ unit tests. |
| Periodontogram (2D, one column per tooth) and all library perio fields | Complete and verified | Added CEJ, root concavity, thickness, Miller, keratinized gingiva, implant mPI/mBI. Not built: row-visibility settings, perio PDF export. |
| Examinations and compare | Implemented but needs validation | Snapshots are frozen; compare view exists. |
| Visit notes and prescriptions | Implemented but needs validation | Notes, prescription print exist; corrections keep a revision history and notes can be voided with a reason. |
| Procedures and treatment plan (scopes, planned vs done, pricing) | Implemented but needs validation | Shared panel verified earlier; free-text tooth field remains (see domain-model.md item 5). |
| Invoices (numbering, issue, cancel by credit note, print) | Complete and verified | Browser flow tested; 5 unit tests. Printed layout checked only as generated HTML. x-facture.com code is not in the repo, so invoices are native. |
| Offline payments (methods, reference, advance, partial, void with reason, receipt) | Complete and verified | Browser flow tested; balances ignore voided payments. |
| Reports and payments CSV | Implemented but needs validation | Skip voided payments; not re-verified visually. |
| WhatsApp (consent, templates, manual send, history) | Partially implemented | Consent, block, log and statuses done. Clinic-editable templates and scheduling missing; automation is Phase 3. |
| Follow-ups and recall list | Implemented but needs validation | Today screen shows recalls; logs each message. |
| Medical certificates and referral letters | Complete and verified | Create, validate, print, persist tested. |
| X | Implemented but needs validation | Verified earlier with a sample PDF; not re-run after this phase. |
| Imaging and patient files | Implemented but needs validation | Upload per tooth and filter exist; no viewer tools (zoom, compare). |
| Prosthesis cases / lab orders | Partially implemented | Lab orders with status, late flag, tooth, shade and a link to the patient file. No file attachments or chart overlay. |
| Inventory, sterilization, implant lots, expenses | Implemented but needs validation | Rules tested; screens exist. |
| Staff and clinic configuration | Partially implemented | Locations, chairs, dentists set up; roles exist, no real authentication (Phase 3). |
| French pass | Implemented but needs validation | 406 keys match in both languages; spot-checked profile, billing, chart. |
| Dark mode | Implemented but needs validation | Chart, billing, profile checked; other modules not re-checked. |
| Desktop and tablet layout | Implemented | V1 is desktop and tablet only; phone-only layouts were removed. Tablet (820 px) checked light and dark for Today, Calendar and Patients with no horizontal overflow. |
| Accessibility (keyboard, labels) | Partially implemented | Labels and aria on new forms; no full keyboard audit. |
| Public clinic page and profile | Implemented | Settings → Clinic profile, preview, SSR page with SEO, sitemap, robots, slug redirects, Google Maps link import. Business Profile OAuth and sync need the backend. |
| Backend, database, authentication | Blocked | Phase 3 by decision. |
| Medical history | Implemented | Conditions checklist, allergies, medications; visible on profile, list filter and booking. |
| Quote acceptance and versions | Implemented | Quotes page records dated versions with accepted, declined or replaced. |

## End-to-end acceptance criteria

1. **Visit to payment.** Register patient → book appointment in the calendar → mark arrived (waiting room) → open the visit → record findings and a note → plan two procedures and mark them done → issue an invoice (number `FA-<year>-0001`) → record a partial cash payment against it with a reference → the invoice shows *Partly paid* and the balance falls by the amount → the patient file keeps visit, acts, invoice and payment. *Run:* invoice and payment steps in a browser; the earlier steps were verified in earlier phases and are not re-run as one script.
2. **Correction.** Void a payment with a reason: it stays listed, struck through, and the balance rises again. Cancel an invoice with a reason: a credit note `AV-<year>-0001` appears, the acts can be invoiced again, numbers are not reused. *Run: yes.*
3. **Reminder.** Set consent → prepare a reminder → WhatsApp opens with the text → the message appears in the patient's history as *Prepared*. Consent *declined* removes the links. *Run: yes (the WhatsApp page itself is blocked in the sandbox).*
4. **Documents.** Write a certificate with rest days and a referral with a recipient → both print and survive a reload; empty or invalid input is refused. *Run: yes.*
5. **Chart.** Edit a tooth in the overlay → the column and the periodontogram update → saving an examination freezes it → later edits do not change it. *Run: yes (earlier phases).*

## Release gate

Phase 2 can close when: no row above is *Missing* except items marked Phase 3; every *Implemented but needs validation* row has been run once in a browser; the build and all tests pass; criteria 1–6 pass in a single recorded run in both languages and both themes.
