# Superseded: PostgreSQL work

Replaced by the Cloudflare D1 direction in `docs/architecture-proposal-d1.md`. Kept for reference only; Neon is no longer used. Paths inside the tools were rewritten for this folder and the tools were not re-run after the move.
# Database (PostgreSQL)

SQL for moving a clinic from the browser's IndexedDB to PostgreSQL. **Nothing in the app uses it yet**: there is no server, no provider and no sign-in. The app still stores everything locally.

## Files
- `migrations/0001_init.sql`: every record type the app has today (clinic, locations, staff, payers, patients, appointments, plan items, invoices, payments, insurance, prescriptions, libraries, practice, documents, settings).
- `migrations/0003_staff.sql`: staff and the staff change log (no PIN hashes).
- `migrations/0002_tenant_isolation.sql`: row-level security. The server runs `select set_config('app.clinic_id', '<id>', true)` per transaction; without it no rows are visible.
- `fixtures/sample-backup.json`: a small backup that exercises every table, including bad references.
- `../db/postgres-superseded/tools/backup-to-sql.mjs`: converts a backup file (Settings, Data and backup) into one SQL transaction.
- `../db/postgres-superseded/tools/check-migration.mjs`: applies the migrations to an in-memory PostgreSQL, imports the fixture, and checks the rules below.

## Run it on Neon
Put the connection string in `.env.local` as `DATABASE_URL=...` (git-ignored), then:
```
node db/postgres-superseded/tools/db-apply.mjs        # applies migrations not yet recorded, in order
node db/postgres-superseded/tools/db-check.mjs        # 39 tables, migrations recorded, RLS forced, a rolled-back write
node db/postgres-superseded/tools/backup-to-sql.mjs my-backup.json > import.sql && psql "$DATABASE_URL" -f import.sql
```
## Check the SQL without a server
```
npm i --no-save @electric-sql/pglite
node db/postgres-superseded/tools/check-migration.mjs                       # 23 checks on an in-memory PostgreSQL
```
Apply migrations as an owner role; run the application as a different role so row-level security applies.

## What the schema enforces
- Money: `numeric(14,2)` with its own ISO currency; nothing converted. Payments, invoices and expenses carry a currency; plan items carry one only after a currency change.
- History is protected: payments, invoices, prescriptions, allergies and payers in use cannot be deleted (no cascades).
- A chair or dentist cannot be double-booked by a live appointment (cancelled and no-show do not block).
- Brand medications need a generic; library names are unique per clinic ignoring case.
- Insurance on a patient (`patient_insurance`) is separate from `payment`; it records coverage, not claims or reimbursement.

## Deliberately left out
- **PIN hashes** are not imported: staff, roles and the staff log are, but credentials come with a server-side sign-in design.
- **Insurance reference list** (`public/insurance/MA.json`) stays a static file; only a clinic's own added insurers are rows.
- **Images and documents** are stored in the row (`logo`, `photo`, `patient_document.content`) until object storage is chosen.
- No server code, connection handling or ORM, and no per-record write API yet (see `docs/postgres-readiness.md`, steps 1 and 2).

## Import behaviour
Optional references to rows missing from the backup become empty; required ones skip the row. Every skip is listed on stderr. The importer is for a first load, not a sync.
