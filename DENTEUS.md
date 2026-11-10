# Dontalist calendar and scheduling contract

`<den-calendar>` is the generic calendar (day / week / month / year) integrated into the Dontalist clinic workflow and wired to patients, dentists and chairs.

> This file preserves the calendar's technical contract and future backend constraints. It is not the current product-status document. See [docs/product-audit.md](docs/product-audit.md) and [docs/repository-audit-2026-11-10.md](docs/repository-audit-2026-11-10.md) for the current frontend inventory.

```html
<den-calendar (openPatient)="..." (openEncounter)="..." (themeChange)="..." />
```

## What is real and what is a stand-in

| Area | Status |
|---|---|
| Scheduling rules (`denteus/rules/scheduling-rules.ts`): overlap across dentist, chair and patient, 15 min to 8 h, status transition table, movable statuses | Real, pure functions. Check current specs for the exact regression coverage; do not rely on the historical test count below. |
| UI: lane day view (by chair or by dentist), week, month, drag/resize with 15-min snap, rollback with explanation, editor, panel, waiting room, light/dark | Implemented. Browser acceptance must be recorded against the current branch; the old 30-check claim is historical. |
| `DentalStore` (`denteus/services/dental-store.service.ts`) | Browser-side clinic persistence using IndexedDB. Replace the local persistence adapter with server-backed persistence when the backend phase is approved. |
| Seed data (`denteus/data/dental-seed.ts`) | **Demo only.** Use `<den-calendar [seed]="false">` in production. |
| Conflict authority and race protection | **Not in the frontend.** The frontend check is a convenience; the backend must be authoritative (below). |
| Authorization, breaks / unavailable time, clinic hours | Role/permission UI and clinic schedule configuration exist in the frontend. This is not server-enforced security; backend authorisation remains required. Break/unavailable-time support needs separate verification. |
| Patient file / clinical encounter screens | Integrated with the wider patient-file workflow. The calendar emits navigation events for patient, encounter and relevant patient-file sections. |
| Billing | Integrated with patient treatment, invoices and offline/manual payment records. Online payment processing remains out of scope. |

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


## Current interaction notes

- Angular CDK is used for event movement. Custom pointer handling remains for resizing, drag-to-create and all-day movement; do not rewrite every pointer interaction merely to claim CDK-only behaviour.
- The calendar is part of the wider patient and clinic workflow, not a standalone scheduling demo.
- Calendar structure follows the monochrome grid system. Interactive controls and event blocks may own appropriate corner treatment; do not apply blanket descendant radius resets.
- Verify the latest implementation in the browser before release, especially move/resize gesture separation, invalid-drop rollback, overlap rules, reduced motion, keyboard/focus behaviour and light/dark contrast.
