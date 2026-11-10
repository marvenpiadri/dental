# Version 1 release checklist (desktop and tablet)

Last run: 10 November 2026, branch `feat/patient-file-acts`. Backend, database and real authentication are out of V1 (deferred by decision). Status words: **Verified** (run in a browser or by tests this pass), **Partly verified**, **Not verified**.

## Build and tests
| Check | Result |
|---|---|
| Unit tests | 480 passing in 61 files |
| Production build (SSR) | Passes. Initial bundle 501.99 kB (warning budget 520 kB, raised for Angular CDK drag-drop). Warning only: `event-editor.component.css` over its 4 kB style budget |
| SSR smoke | Server renders and serves all routes below (Node 24, `NG_ALLOWED_HOSTS=localhost`) |

## Browser sweep (Chromium)
15 routes (Today, Calendar, Patients, Reports, Practice, Settings x3, and the patient file pages: overview, chart, billing, appointments, quotes, visit notes, files) at 1440, 1024 and 820 px, light and dark, English and French: no page errors and no page-level horizontal scroll. This checks overflow and crashes, not pixel-level appearance; only a sample of screens was inspected by eye.

| Flow | Result |
|---|---|
| Calendar: click opens panel, resize, drag-to-create, completed appointment refuses a move with a reason, week-view move | Verified (earlier CDK suite re-run on the merged build) |
| Visit day: new patient, book from profile, arrive, start, record act without chart, complete, bill, pay in full, issue invoice | Verified end to end; 11 clicks from the saved patient to invoice and payment |
| Backup and restore round trip | Unit-tested; settings, staff and templates covered. Not re-run in a browser this pass |
| Printing | HTML generation unit-tested; real paper/PDF output not checked |
| Reduced motion, keyboard operation of calendar | Reduced-motion CSS in place; full keyboard audit not done |
| Roles and permission UI | Rules unit-tested; role-based hiding not browser-verified end to end |

## Known limits (do not claim otherwise)
- Roles and PIN sign-in are a frontend convenience, not security. Data is in the browser and readable with devtools.
- Data lives only in IndexedDB; the backup file is the only safety net. No sync between devices.
- Phone layouts were removed from V1; tablets (820 px and up) are supported.
- Payments are offline clinic records only.
- Prescriptions are a general editor with free text; no clinical decision support.
- Inventory is name, quantity and minimum only. Tasks are a plain checklist.
- First-run: a new clinic needs a dentist and a chair before booking (the calendar now says so).

## Before calling V1 accepted
1. Run the print layouts to PDF and review them.
2. Browser-verify role hiding and the activity log for each of the six roles.
3. Run the backup, wipe, restore round trip in a browser.
4. Keyboard pass over the calendar, appointment panel and patient file.
5. Decide the open product questions in `docs/claude-handoff-2026-11-10.md` (insurance scope below).
