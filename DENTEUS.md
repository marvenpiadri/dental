# Dontalist: scheduling module and backend requirements

`<den-calendar>` is the generic calendar (day / week / month / year). In the app it is wrapped by `DentalCalendarComponent` and wired to patients, dentists and chairs. The app is a **desktop and tablet** product (phones are out of V1 scope). Dontalist is one clinic per account.

## What is real and what is a stand-in

| Area | Status |
|---|---|
| Scheduling rules (`denteus/rules/scheduling-rules.ts`): overlap across dentist, chair and patient, 15 min to 8 h, status transitions, movable statuses | Real, pure functions, unit-tested |
| Calendar UI: chair/dentist lanes, week, month, year; move with Angular CDK drag-drop (pre-drop validation, refused drops snap back with the reason); custom pointer code only for resize, drag-to-create and all-day events; chair tint plus dentist bar colours; light/dark | Real |
| Patient file, quick acts from the appointment panel, treatment plan, invoices, payments, quotes, visit notes, prescriptions, imaging, practice, reports | Real, local only |
| `DentalStore` and clinic database (`denteus/services/`) | **Local persistence.** IndexedDB in the browser; backups are explicit JSON files. Replace with API calls when the backend exists. |
| Offline | Angular service worker caches the shell in production builds (`ngsw-config.json`). Data is local, so the app works offline; there is no sync. |
| Seed data (`denteus/data/dental-seed.ts`) | Demo only; turn off with `<den-calendar [seed]="false">`. |
| Roles and PIN sign-in | **Frontend-only convenience, not security.** PINs are salted hashes in browser storage; anyone with devtools can read or edit the data. Real access control needs the backend. |
| Conflict authority and race protection | Not in the frontend. The frontend check is a convenience; the backend must be authoritative (below). |
| Billing | Offline clinic payments only. No online payment processing, and no CNSS/CNOPS/FAR or mutual-insurance forms (permanently out of scope). |

## Contract the real API must satisfy (backend requirement)

Every method returns `ApiResult<T>`: `{ok:true,value}` or `{ok:false, code, message, details?}` with `code` one of `conflict | invalid | forbidden | not-found | error`.

- `createAppointment(draft)`: refuse with `conflict` if the dentist, chair or patient is busy at any point of `[start,end)`.
- `reschedule(id, {start,end,dentistId,chairId})`: only for `scheduled` / `confirmed` (otherwise `forbidden`); same conflict rule; append to `scheduleHistory`. **Must not change the linked clinical encounter's dates.**
- `updateAppointment(id, draft)`: notes/reason only when not movable.
- `transition(id, to)`: enforce the table below; `arrived` only on the appointment's day; reinstating (`cancelled`/`no-show` to `scheduled`) re-checks conflicts.
- `linkEncounter(id, encounterId)`.

```
scheduled   -> confirmed, arrived, cancelled, no-show
confirmed   -> arrived, cancelled, no-show
arrived     -> in-progress, cancelled
in-progress -> completed
completed   -> (final)
cancelled   -> scheduled
no-show     -> scheduled
```

Conflicts are half-open intervals, so 10:00–10:30 and 10:30–11:00 do not conflict. `completed` still occupies its slot; `cancelled` and `no-show` do not.

## Race protection (Postgres)

Check-then-insert in application code is not safe under concurrent requests. Enforce it in the database:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE appointments
  ADD CONSTRAINT no_dentist_overlap EXCLUDE USING gist
    (dentist_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
    WHERE (status IN ('scheduled','confirmed','arrived','in_progress','completed')),
  ADD CONSTRAINT no_chair_overlap EXCLUDE USING gist
    (chair_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
    WHERE (status IN ('scheduled','confirmed','arrived','in_progress','completed')),
  ADD CONSTRAINT no_patient_overlap EXCLUDE USING gist
    (patient_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
    WHERE (status IN ('scheduled','confirmed','arrived','in_progress','completed'));
```

Map the exclusion violation (SQLSTATE `23P01`) to HTTP 409 and `code: 'conflict'` with a message naming the resource and time.

## Wiring to the rest of the app

1. Reimplement `DentalStore` against the API, keeping the method signatures and the `patients / dentists / chairs / appointments` signals.
2. Handle `(openPatient)` and `(openEncounter)` with router navigation.
3. Other booking systems: the generic calendar takes `lanes`, `resources` and a `gateway`, so a different mapper plus store is all that is needed.
