# Product audit (frontend), 6 November 2026

Scope: every route, nav item, settings area and workflow reachable in the app today. Backend, database and online payments are out of scope by decision.

## A. Inventory

| Route | What it does | Status |
|---|---|---|
| `/today` | Day dashboard: booked, waiting room, upcoming list, WhatsApp reminders and recall list (logged) | Complete |
| `/calendar` | Strict calendar, dentists and chairs, appointment editor, statuses | Complete, kept as is |
| `/patients` | List with search, filters (all, today, alerts, archived), sort | Complete |
| `/patients/new`, `/:id/edit` | Registration and edit form with validation and duplicate check | Complete |
| `/patients/:id` (+ 7 tabs) | Overview, chart (odontogram + periodontogram), appointments, payments and invoices, quotes, visit notes (+ letters), imaging and files | Complete; imaging viewer (zoom, invert, browse) and visit-note revision history added, not yet browser-tested |
| `/practice` | Tasks, implant lots, sterilization, expenses, stock, lab orders | Complete for current scope |
| `/reports` | Revenue series, per dentist, per payment method, CSV | Complete |
| `/setup/clinic` | Clinic name, address, phone, email | New, complete |
| `/setup/team` | Dentists, staff roles and PINs | Complete |
| `/setup/schedule` | Opening hours, chairs | Complete |
| `/setup/services` | Act catalog and prices, invoice legal details | Complete |
| `/setup/messaging` | Clinic wording for the three WhatsApp messages | New, complete |
| `/setup/integrations` | Google Business Profile, WhatsApp Cloud API: honest "Not connected, needs the online version" | New; informational only |
| `/setup/workspace` | Theme, language, patient-file tabs, 3D toggle, backup and restore | Complete |
| sign-in gate, 404 | Role sign-in; not-found page | Complete |

## B. Gaps found and what was done

| Gap | Result |
|---|---|
| No clinic identity or contact settings | Added `/setup/clinic`; name feeds every printed document |
| No invoice legal details (ICE, bank, note) | Added; printed on invoices |
| WhatsApp wording fixed in code | Editable per clinic with placeholders; falls back to built-ins |
| Integrations not visible | Status screen, no fake connect button |
| Settings was one long page, nav said "Clinic" | Seven sections; nav says Settings |
| No way to remove a patient | Archive and restore; records kept; hidden from list and appointment search |
| No invoices, payment voiding or references | Built and verified (earlier in this phase) |
| No consent or message history | Built and verified |
| No certificates or referral letters | Built and verified |
| Logo | Official logo in rail, sign-in, favicon, app icons, printed documents |

## C. Still open (frontend)

1. Appointment settings (default duration, slot step) are per appointment type in code, not editable in Settings.
2. Billing preferences beyond legal details (enabled payment methods, currency) are not configurable; MAD only.
3. Notification preferences: none exist because nothing sends notifications yet.
4. Clinical preferences (default chart numbering is on the chart; no clinic-wide default).
5. Stock thresholds are per item on the Practice page; no Settings entry (intentional).
6. Periodontogram row-visibility settings and perio PDF export from the reference library.
7. Imaging viewer tools (zoom, side-by-side), prosthesis case file.
8. Visit-note corrections overwrite the note: no revision history.
9. Keyboard and screen-reader audit of the whole app; dark mode check of Practice, Reports and Settings.
10. Clinic logo upload (the Dontalist logo is fixed).

## D. Needs backend or external accounts

Google Business Profile sync and public clinic page, WhatsApp Cloud API sending and delivery status, real staff authentication, multi-device sync, server backups. See `docs/domain-model.md`.

## E. Checks run

Unit tests 407 pass. Production build passes (SSR). No lint tool is configured in this project, so no lint result exists. Browser runs this session: odontogram, invoices and payments, consent and message log, letters, settings sections, archive and restore, French + dark + phone sweep of the eight patient tabs.

## Direction change

CNSS/CNOPS support was dropped permanently: no forms tab, generator, templates, PDF libraries or `clinicalRecords` store. The product name is Dontalist. Backend work stays paused.
