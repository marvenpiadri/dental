> **Historical snapshot — do not use as the current task list.** This report records an earlier review and contains statuses that have since changed. For the current source-level inventory and known gaps, see [product-audit.md](product-audit.md) and [repository-audit-2026-11-10.md](repository-audit-2026-11-10.md). Current country-pack decisions are in [product-direction-country-packs.md](product-direction-country-packs.md).

# Release gap report (7 November 2026)

Baseline: commit 264247b plus the clinic-profile rules below. Statuses use the brief's classes.

| Area | Status | Evidence / note |
|---|---|---|
| Patients, archive, medical alert | Complete and verified | Browser-tested earlier this phase |
| Odontogram and periodontogram | Complete and verified | Browser-tested, shared layout |
| Visit notes and revisions | Complete and verified | Browser-tested light, dark, phone (7 Nov) |
| Imaging viewer | Complete and verified | Browser-tested light, dark, phone (7 Nov) |
| Invoices, credit notes, voids, receipts | Complete and verified | Browser-tested; real print layout not yet checked |
| WhatsApp (manual, consent, log) | Complete and verified | No integration claimed |
| CNSS/CNOPS | Removed | Legacy stores left inert, tested on a v3 database |
| Calendar and waiting room end-to-end | Implemented but insufficiently tested | Smoke-tested only |
| Print layouts (invoice, letters, quote) | Implemented but insufficiently tested | Unit-tested HTML; not rendered to paper/PDF |
| Dark mode of Practice, Reports, Settings | Implemented but insufficiently tested | |
| Keyboard / accessibility audit | Missing | |
| Settings: appointment durations, payment methods, notifications | Missing | Next after this brief's profile work |
| Prosthesis case file (tooth, shade) | Missing | Lab orders have work, lab, due date only |
| Roles | Partially implemented | 3 roles, 4 coarse permissions; brief needs 6 roles with grouped actions |
| Tasks | Partially implemented | Practice page has a task list; no assignee, patient link or history |
| Clinic profile and slug rules | Partially implemented | Model and rules with 12 tests; no screen yet |
| Google Places, public pages, sitemap | Missing | Needs a Maps key and a server-readable data source |
| Global slug uniqueness, server auth, files, Business Profile OAuth | Backend-dependent, deferred | |
| Multi-location | Not building | `locations` store holds exactly one clinic by decision |

Architecture constraint found: public pages must be rendered from data the server can read, but all clinic data lives in the owner's browser. The public route will read through one `PublicClinicSource` interface. Until the backend exists the only implementation is a server-side JSON file with the shape the future API returns; the owner exports it from Settings. This is a seam, not a working publishing service.

## Frontend gap review (this phase)

Done: appointment lengths per type, enabled payment methods, Today notification lists, lab case tooth and shade with a patient-file link, and the Settings schedule section (dentists, hours, chairs) that a template cleanup had dropped.

Already complete and untouched: calendar conflicts, dentist and chair assignment, waiting room, statuses; Practice task list (a plain checklist, enough for the front desk).

Also done (second pass): structured medical history (ticked conditions, allergies, medications) shown on the profile, the patient list alert filter and the booking form; quote versions per patient with accepted/declined and the replaced older quote kept. Nothing left from the gap list in the frontend.

Limits to know: conditions are a fixed list (no custom entries); a quote records the planned items and total at that moment, it does not freeze the plan itself.

Google Business: the clinic's Google data is imported from a Maps link. A live Business Profile connection needs OAuth and a server, so Settings → Integrations says "not connected". Nothing simulates a connection.

Backend needs recorded for later: global slug uniqueness, server-side permissions, stored files instead of data URLs, Places terms review for stored place data, automated WhatsApp sending.
