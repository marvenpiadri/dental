# Denteus appointment calendar

`<den-calendar>` is the generic calendar (day / week / month / year) wired to patients, dentists and chairs.

```html
<den-calendar (openPatient)="..." (openEncounter)="..." (themeChange)="..." />
```

## What is real and what is a stand-in

| Area | Status |
|---|---|
| Scheduling rules (`denteus/rules/scheduling-rules.ts`): overlap across dentist, chair and patient, 15 min to 8 h, status transition table, movable statuses | Real, pure functions, 28 unit tests |
| UI: lane day view (by chair or by dentist), week, month, drag/resize with 15-min snap, rollback with explanation, editor, panel, waiting room, light/dark | Real, driven end-to-end in Chromium (30 checks) |
| `DentalStore` (`denteus/services/dental-store.service.ts`) | **Stand-in.** In-memory + localStorage. Replace with HTTP calls to the Denteus API. |
| Seed data (`denteus/data/dental-seed.ts`) | **Demo only.** Use `<den-calendar [seed]="false">` in production. |
| Conflict authority and race protection | **Not in the frontend.** The frontend check is a convenience; the backend must be authoritative (below). |
| Authorization, breaks / unavailable time, clinic hours | Not implemented. |
| Patient file / clinical encounter screens | Not in the calendar. It emits `openPatient(patientId)` and `openEncounter(appointmentId)`. |
| Billing | Intentionally excluded. |

## Contract the real API must satisfy

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
