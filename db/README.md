# Database (PostgreSQL)

SQL for moving a clinic from the browser's IndexedDB to PostgreSQL. **Nothing in the app uses it yet**: there is no server, no provider and no sign-in. The app still stores everything locally.

## Files
- `migrations/0001_init.sql`: every record type the app has today (clinic, locations, payers, patients, appointments, plan items, invoices, payments, insurance, prescriptions, libraries, practice, documents, settings).
- `migrations/0002_tenant_isolation.sql`: row-level security. The server runs `select set_config('app.clinic_id', '<id>', true)` per transaction; without it no rows are visible.
- `fixtures/sample-backup.json`: a small backup that exercises every table, including bad references.
- `../tools/backup-to-sql.mjs`: converts a backup file (Settings, Data and backup) into one SQL transaction.
- `../tools/check-migration.mjs`: applies the migrations to an in-memory PostgreSQL, imports the fixture, and checks the rules below.

## Try it
```
npm i --no-save @electric-sql/pglite
node tools/check-migration.mjs                       # 23 checks
node tools/backup-to-sql.mjs my-backup.json > import.sql
psql "$DATABASE_URL" -f db/migrations/0001_init.sql -f db/migrations/0002_tenant_isolation.sql -f import.sql
```
Apply migrations as an owner role; run the application as a different role so row-level security applies.

## What the schema enforces
- Money: `numeric(14,2)` with its own ISO currency; nothing converted. Payments, invoices and expenses carry a currency; plan items carry one only after a currency change.
- History is protected: payments, invoices, prescriptions, allergies and payers in use cannot be deleted (no cascades).
- A chair or dentist cannot be double-booked by a live appointment (cancelled and no-show do not block).
- Brand medications need a generic; library names are unique per clinic ignoring case.
- Insurance on a patient (`patient_insurance`) is separate from `payment`; it records coverage, not claims or reimbursement.

## Deliberately left out
- **Staff, roles and PINs** are not imported. Sign-in and permissions need a server-side design first (the browser list is not a safe starting point).
- **Insurance reference list** (`public/insurance/MA.json`) stays a static file; only a clinic's own added insurers are rows.
- **Images and documents** are stored in the row (`logo`, `photo`, `patient_document.content`) until object storage is chosen.
- No server code, connection handling or ORM, and no per-record write API yet (see `docs/postgres-readiness.md`, steps 1 and 2).

## Import behaviour
Optional references to rows missing from the backup become empty; required ones skip the row. Every skip is listed on stderr. The importer is for a first load, not a sync.
