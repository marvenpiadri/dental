# Dentaleus: design and architecture notes

## The one idea

A clinic app should feel like a ruled ledger: white against black, structure drawn with 1px lines, almost no decoration. Two zones keep that honest without making every page look like a spreadsheet.

| Zone | What | Rules |
|---|---|---|
| **Strict** | The nav rail, every page header, page edges, **the calendar** | 1px borders only. No border radius. No padding outside boxes. 100% width and height. The header is always 64px so its bottom line runs into the rail's logo cell. |
| **Free** | The content of a page (cards, forms, lists) | Tinted canvas, rounded cards (`--radius-card`), padding, icons, status chips. |

The calendar is the exception inside the exception: it stays strict even though it is page content. `den-calendar, den-calendar *` forces `border-radius: 0` in `src/styles.css`.

### The standard for the free zone (Dentisto-style: simple and calm)

Every page follows the same recipe, set once in `src/styles.css` so new pages inherit it:

- **Grid, not floating cards**: pages have no outer padding and no gaps. Panels (`.card`) sit edge to edge, separated only by 1px lines, square corners. Wide pages use `.grid-wide` (two columns) or `.grid-2`/`.grid-kpi`; tab strips are edge to edge with an underline on the open tab.
- **Panel title** 16px bold (`.card-title`), no rule under it. The page title lives in the 64px header, not in a panel.
- **Forms**: bold 13px label above a 44px field (`.field`, `.label`, `.input`), one column, full width, two columns only for short pairs. Border `--app-field`.
- **Tables**: grey header row, zebra rows, no vertical lines (`.zebra` on any grid of rows).
- **One accent** (`--app-accent`, indigo) for primary actions and the active state. Change the variable and the whole app follows. Everything else stays neutral.
- Patient file: social-style cover, stats strip and edge-to-edge bordered cells (strict-style grid) for the page body.

Colour: otherwise monochrome. The status colours (`--app-ok/warn/info/danger`) tint small things only (dots, icons, chips, one alert border), never a surface, and a status is never colour alone: it always has a text label.

## Where things live

```
src/styles.css           tokens (light/dark), page frame, cards, buttons, inputs, empty/skeleton states
src/app/core/            ThemeService, I18n (+ en.ts, fr.ts), PageTitle, cookie reader
src/app/app.*            shell: nav rail + router outlet
src/app/calendar/        the generic calendar (views, drag/resize, store). Strict zone.
src/app/denteus/         the clinic: DentalCalendar wrapper, Today, patients/, store, scheduling rules
```

Routes: `/today`, `/reports` (money, visits, no-shows, per dentist), `/setup` (dentists and chairs; saves on every change, refuses to remove ones that have appointments), `/calendar`, `/patients`, `/patients/new`, `/patients/:id`, `/patients/:id/edit`. All lazy.

## Every appointment happens in the calendar

There is no appointments page. Other pages link into the calendar with query parameters, which arrive as component inputs (`withComponentInputBinding`):

| URL | Effect |
|---|---|
| `/calendar?date=2026-10-23&appointment=<id>` | Opens that day, selects the visit, scrolls it into view |
| `/calendar?book=1` | Opens the booking form |
| `/calendar?book=1&patient=<id>` | Booking form with that patient chosen (their medical alert is shown) |

Dates in these links are the **local** calendar day (`localIsoDay`), never `toISOString()`.

## Server-side rendering rules

The server renders per request (`RenderMode.Server`), not prerendered: pages will sit behind a sign-in and depend on cookies.

1. **Theme and language live in cookies** (`dtl-theme`, `dtl-lang`), so the server sends the right theme and language in the first byte. With no cookie the server follows `Accept-Language`, and an inline script in `index.html` applies the system theme before first paint.
2. **Markup never branches on theme.** The server can't know the system theme, and a mismatch breaks hydration. Swap theme-dependent icons with CSS (`.icon-to-dark` / `.icon-to-light`).
3. **Nothing that depends on the clock, the time zone or IndexedDB renders on the server.** Pages show a skeleton until `DentalStore.loaded()`, which only becomes true in the browser. The calendar sits in `@defer (on immediate)`, so the server sends only its placeholder.
4. Never call `inject()` inside `afterNextRender`/`setTimeout` callbacks; take what you need in the constructor.
5. `angular.json` has `security.allowedHosts` (`dentaleus.com`). To run the built server locally: `NG_ALLOWED_HOSTS=localhost npm run serve:ssr:calendar-app`.

## Languages

`I18n` is a runtime service (not build-time Angular i18n), so one build serves every language and the server can pick by cookie. In a template: `{{ t('patients.new') }}`; plurals: `i18n.tn('patients.count', n)` reads `patients.count.one` / `.other`; dates: `i18n.date(...)`, `i18n.time(...)`.

**Add a language:** create `src/app/core/i18n/<code>.ts` typed `Record<keyof typeof en, string>` (the compiler lists every missing key), then add one line to `LANGS`. Right-to-left (Arabic) additionally needs a layout pass: the new pages already use logical properties (`inset-inline-start`, `margin-inline`) where they matter, but the calendar does not.

**Not translated yet:** the calendar's own buttons and labels (Day/Week/Month/Year, Today, the booking form, the appointment panel, the waiting-room block) and the seed demo data. Its month and weekday names and dates do follow the language.

Copy rules (`en.ts` header): sentence case, buttons start with a verb, empty states say what/why/what to do, errors say what happened and how to fix it.

## Data

`DentalStore` is still the browser-side stand-in for the API (IndexedDB). Patient fields beyond name and phone are optional; the old records keep working. Patient rules (validation, accent-insensitive search, age) are pure functions in `patients/patient-rules.ts`, tested in `patient-rules.spec.ts`.

Backup and restore (Clinic page) is the safety net while data lives only in the browser. Visit notes with printable prescriptions are on the patient file, started from the calendar panel. Documents and X-rays are stored per patient in IndexedDB (database version 3), outside the backup file. Not built yet, and the biggest gaps for a real clinic: **opening hours and multiple sites** in clinic setup (dentists, chairs and the act catalog are done), sign-in and roles, per-visit clinical notes, printable invoices and a full finance report (Today lists unpaid balances; the odontogram, a priced treatment plan and per-patient payments with a balance exist), billing, reminders (WhatsApp/SMS), and the real API.

## Dental chart (CRM-native engine)

The Clinical tab uses our own chart (`src/app/denteus/odontogram/`), not an embedded shell. Rules and tooth artwork come from [angular-advanced-odontogram](https://github.com/ZoliQua/Angular-Advanced-Odontogram) v2.7.0 (Zoltan Dul, MIT), vendored in `engine/vendor/` (licence in `LICENSE.odontogram`, also served at `/odontogram/LICENSE.txt`). Reconnaissance and coupling map: `docs/odontogram-engine.md`.

- **Engine (pure, no Angular/DOM, no globals):** `chart.ts` validated read/write per patient; `edits.ts` validated tooth edits; `plan.ts` findings vs plan kept separate (a planned restoration is never a finding; status edits on planned teeth ask first, and "planned" is derived from plan≠status so it survives reloads); `exam.ts` dated frozen examination records, comparison, suggested diagnoses (never confirmed automatically); `render.ts` paints SVG layers from state.
- **UI:** `dental-chart` (modes Findings/Plan, tabs Tooth/Periodontal/Diagnoses/History), `tooth-tile`, `tooth-editor`, `perio-editor`; labels EN/FR in `labels.ts` and `core/i18n/dental-chart.ts`. Artwork in `public/odontogram/teeth`, loaded lazily in the browser.
- **Integrity:** an unreadable stored chart locks the chart instead of being overwritten; unrecognised stored values are reported, not silently accepted.
- **Not done:** deciduous-only chart, occlusal view, measured anatomy, FHIR/PDF export UI, perio classification and charts, notes per tooth, numbering systems.

## Team sign-in (roles)
Optional. No staff = open app. Adding an owner on the Clinic page (Team and access) turns on a PIN sign-in. Owner sees everything, dentist sees Overview + Clinical, reception sees Overview + Billing; Reports and Clinic are owner-only (`permissionGuard`, route `data.permission`). Staff live in IndexedDB `settings` (salted SHA-256), session in `sessionStorage`, and are not part of backups. This is a UI lock, not security: real access control arrives with the Postgres backend.

## Practice page, notes, install
`/practice`: tasks, implant and sterilization traceability (find patients by implant lot), expenses (monthly total), stock (alert level), lab work (late when still at the lab after its due day). Lists live in IndexedDB `settings` (`expenses`, `stock`, `lab`) through `PracticeStore`; included in backups. Visit notes can be edited (keep id and date). `manifest.webmanifest` + icons make the app installable; there is no service worker, so it still needs the server to open.

## Recall and quotes
Today lists patients whose last completed visit is 6+ months old with nothing booked (`recall-rules.ts`), each with a WhatsApp invite. The treatment plan prints a quote (devis) for planned work (`quote-html.ts`).

