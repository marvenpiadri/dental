# Dontalist: design and architecture notes

## The one idea

A clinic app should feel like a ruled ledger: black and white, structure drawn with 1px lines, minimal decoration. The grid is the visual foundation; controls remain usable and may have their own corner treatment.

| Rule | Application |
|---|---|
| **Strict grid** | Page frame, navigation rail, headers, panel boundaries and calendar structure use clear 1px divisions and aligned edges. |
| **Flexible controls** | Buttons, inputs, selects, popovers, chips, tooltips, selected states and event controls may use controlled corner radii when it improves usability. |
| **Monochrome primary** | Primary actions and active navigation use black/white theme tokens. Green is not the default accent. |
| **Semantic status** | Success, warning, information and danger colours are reserved for small status indicators and always have a text/icon cue. |

The page header is 64px and aligns with the navigation rail. Calendar structure stays square, while each event and interactive control owns its own corner treatment. Do not apply blanket radius resets to every descendant of the calendar.

### Layout and controls

- **Grid, not floating cards**: panels sit edge to edge and are separated by 1px borders. Avoid decorative floating-card layouts and unnecessary gaps.
- **Panel title**: 16px bold (`.card-title`). The page title lives in the 64px header.
- **Forms**: clear labels above fields; standard inputs are at least 44px high. Use one column by default and two columns for short related fields.
- **Tables**: clear header row, restrained zebra rows where useful, and avoid unnecessary vertical rules.
- **Controls**: use the shared `--radius-control` token for appropriate controls. Do not force cards or page structure to become rounded.
- **Patient file**: retain the social-style profile header and stats, with clinical sections organised on the same disciplined grid.

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

**Localization follow-up:** verify the calendar's own buttons and labels (Day/Week/Month/Year, Today, booking form, appointment panel and waiting-room block) in both supported languages. Month and weekday names follow the calendar locale. Arabic requires a separate RTL layout and terminology pass before it is offered.

Copy rules (`en.ts` header): sentence case, buttons start with a verb, empty states say what/why/what to do, errors say what happened and how to fix it.

## Data

`DentalStore` is still the browser-side stand-in for the API (IndexedDB). Patient fields beyond name and phone are optional; the old records keep working. Patient rules (validation, accent-insensitive search, age) are pure functions in `patients/patient-rules.ts`, tested in `patient-rules.spec.ts`.

Backup and restore is the safety net while clinic data lives in the browser. The current clinic store uses IndexedDB. The production app registers Angular's service worker to cache the app shell and assets; this is not a substitute for server-side persistence or backups. The frontend includes clinic setup, team/role UI, patient files, visit records, charts, billing, reports, documents, manual WhatsApp preparation/history and practice tools. These remain local-first frontend capabilities until a real backend, authentication and server-side file storage are implemented. See [docs/repository-audit-2026-11-10.md](docs/repository-audit-2026-11-10.md) for the source-level feature inventory and verification limits.

## Dental chart (CRM-native engine)

The Clinical tab uses our own chart (`src/app/denteus/odontogram/`), not an embedded shell. Rules and tooth artwork come from [angular-advanced-odontogram](https://github.com/ZoliQua/Angular-Advanced-Odontogram) v2.7.0 (Zoltan Dul, MIT), vendored in `engine/vendor/` (licence in `LICENSE.odontogram`, also served at `/odontogram/LICENSE.txt`). Reconnaissance and coupling map: `docs/odontogram-engine.md`.

- **Engine (pure, no Angular/DOM, no globals):** `chart.ts` validated read/write per patient; `edits.ts` validated tooth edits; `plan.ts` findings vs plan kept separate (a planned restoration is never a finding; status edits on planned teeth ask first, and "planned" is derived from plan≠status so it survives reloads); `exam.ts` dated frozen examination records, comparison, suggested diagnoses (never confirmed automatically); `render.ts` paints SVG layers from state.
- **UI:** `dental-chart` (modes Findings/Plan, tabs Tooth/Periodontal/Diagnoses/History), `tooth-tile`, `tooth-editor`, `perio-editor`; labels EN/FR in `labels.ts` and `core/i18n/dental-chart.ts`. Artwork in `public/odontogram/teeth`, loaded lazily in the browser.
- **Integrity:** an unreadable stored chart locks the chart instead of being overwritten; unrecognised stored values are reported, not silently accepted.
- **Later/needs separate validation:** any additional chart capabilities should be justified by routine dental workflows. The repository has since added an occlusal view for premolars/molars, primary-tooth numbering (51–85), whole-mouth probing-depth graphing and chart display options; do not treat older notes about these as current gaps.

## Team sign-in (roles)
Optional. No staff = open app. Adding an owner on the Clinic page (Team and access) turns on a PIN sign-in. Owner sees everything, dentist sees Overview + Clinical, reception sees Overview + Billing; Reports and Clinic are owner-only (`permissionGuard`, route `data.permission`). Staff live in IndexedDB `settings` (salted SHA-256), session in `sessionStorage`, and are not part of backups. This is a UI lock, not security: real access control arrives with the Postgres backend.

## Practice page, notes, install
`/practice`: tasks, implant and sterilization traceability (find patients by implant lot), expenses (monthly total), stock (alert level), lab work (late when still at the lab after its due day). Lists live in IndexedDB `settings` (`expenses`, `stock`, `lab`) through `PracticeStore`; included in backups. Visit notes can be edited (keep id and date). `manifest.webmanifest` + icons make the app installable. Angular's service worker caches the production app shell and assets; clinic data remains local in IndexedDB until backend migration.

## Recall and quotes
Today lists patients whose last completed visit is 6+ months old with nothing booked (`recall-rules.ts`), each with a WhatsApp invite. The treatment plan prints a quote (devis) for planned work (`quote-html.ts`).



## Product and country configuration

Dontalist follows a universal-core, country-pack model. Morocco is the first supported market; country-specific rules and workflows belong in a Morocco pack rather than being hardcoded into universal components. See [docs/product-direction-country-packs.md](docs/product-direction-country-packs.md). Country, language, currency and time zone are separate settings.
