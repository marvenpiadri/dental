# Dentaleus: design and architecture notes

## The one idea

A clinic app should feel like a ruled ledger: white against black, structure drawn with 1px lines, almost no decoration. Two zones keep that honest without making every page look like a spreadsheet.

| Zone | What | Rules |
|---|---|---|
| **Strict** | The nav rail, every page header, page edges, **the calendar** | 1px borders only. No border radius. No padding outside boxes. 100% width and height. The header is always 64px so its bottom line runs into the rail's logo cell. |
| **Free** | The content of a page (cards, forms, lists) | Tinted canvas, rounded cards (`--radius-card`), padding, icons, status chips. |

The calendar is the exception inside the exception: it stays strict even though it is page content. `den-calendar, den-calendar *` forces `border-radius: 0` in `src/styles.css`.

Colour: monochrome. The status colours (`--app-ok/warn/info/danger`) tint small things only (dots, icons, chips, one alert border), never a surface, and a status is never colour alone: it always has a text label.

## Where things live

```
src/styles.css           tokens (light/dark), page frame, cards, buttons, inputs, empty/skeleton states
src/app/core/            ThemeService, I18n (+ en.ts, fr.ts), PageTitle, cookie reader
src/app/app.*            shell: nav rail + router outlet
src/app/calendar/        the generic calendar (views, drag/resize, store). Strict zone.
src/app/denteus/         the clinic: DentalCalendar wrapper, Today, patients/, store, scheduling rules
```

Routes: `/today`, `/setup` (dentists and chairs; saves on every change, refuses to remove ones that have appointments), `/calendar`, `/patients`, `/patients/new`, `/patients/:id`, `/patients/:id/edit`. All lazy.

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

Not built yet, and the biggest gaps for a real clinic: **opening hours and multiple sites** in clinic setup (dentists and chairs are done), sign-in and roles, treatment plans and per-visit clinical notes (the tooth chart exists: six conditions per tooth, adult FDI teeth only), billing, reminders (WhatsApp/SMS), and the real API.
