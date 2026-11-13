# PostgreSQL readiness

Status: the schema and a backup importer now exist in `db/` (see `db/README.md`) and are verified against a real PostgreSQL engine. Still no provider chosen, no backend, no auth change: the app stores everything in IndexedDB. Steps 3 and 4 below are done (every table the app stores now has a schema, including staff); the `clinic_id` and `version` columns exist in SQL but not yet in the browser models.

## Where the app stands
- Every record has a UUID, so ids map to primary keys.
- All storage goes through `ClinicDatabase` and `DentalStore`; screens never touch IndexedDB.
- Library relations are id references (brand → generic, patient records → library entries, template alerts → library entries).
- Prescriptions are immutable snapshots; allergy and medication records carry audit history.
- Backup JSON (`dontalist`, version 1) and library JSON (`dontalist.library`, schema 1) are versioned: they are the first import path.

## Gaps before a server
1. Patients are one nested object (allergies, medications, prescriptions, notes, odontogram inside). Needs splitting into tables.
2. The store saves whole collections; a server needs per-record writes and conflict detection (`version` column).
3. Roles and PIN exist only in the frontend; the server must check permissions itself.
4. No `clinic_id` on any record (no tenant separation).
5. Delete protection, merge and import validation run in the browser; the server must enforce them.
6. IndexedDB upgrades are not a migration plan.

## Repository interface (extract from `ClinicDatabase`)
```ts
interface Repo<T extends { id: string }> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  save(item: T, expectedVersion?: number): Promise<T>;   // throws on version conflict
  remove(id: string): Promise<void>;
}
// medications, allergyDefs, rxTemplates, patients, patientAllergies, patientMedications, prescriptions, appointments...
```
The IndexedDB implementation stays as the offline/local one; a PostgreSQL one is a second implementation.

## Schema sketch (library and patient medical records)
```sql
create table clinic (id uuid primary key, name text not null);

create table med_library (
  id uuid primary key, clinic_id uuid not null references clinic,
  kind text not null check (kind in ('generic','brand')),
  name text not null, notes text, hidden boolean not null default false,
  generic_id uuid references med_library(id),
  check ((kind = 'brand') = (generic_id is not null)),
  version int not null default 1, updated_at timestamptz not null default now()
);
create table allergy_def (
  id uuid primary key, clinic_id uuid not null references clinic,
  name text not null, medication_id uuid references med_library,
  external_id text, hidden boolean not null default false,
  version int not null default 1
);
create table rx_template (
  id uuid primary key, clinic_id uuid not null references clinic,
  name text not null, items jsonb not null, updated_at timestamptz not null
);   -- items keep their medication_id/alerts; checked on write
create table patient_allergy (
  id uuid primary key, patient_id uuid not null references patient,
  allergy_id uuid not null references allergy_def,   -- no cascade: in-use rows block delete
  reaction text, reaction_date date, active boolean not null,
  legacy_text text, created_at timestamptz not null, removed_at timestamptz
);
create table patient_medication (
  id uuid primary key, patient_id uuid not null references patient,
  medication_id uuid not null references med_library,
  notes text, start_date date, stop_date date, active boolean not null,
  source text check (source in ('manual','prescribed','reported')),
  prescription_id uuid references prescription,
  legacy_text text, created_at timestamptz not null, removed_at timestamptz
);
create table record_audit (
  id bigserial primary key, record_type text not null, record_id uuid not null,
  at timestamptz not null, what text not null, note text
);
create table prescription (          -- issued rows are never updated except by void/supersede
  id uuid primary key, patient_id uuid not null references patient,
  number text unique, status text not null, snapshot jsonb, issued_at timestamptz
);
```
Foreign keys without cascade give the same delete protection the browser rules provide. The sketch above is the library part only; the complete schema is `db/postgres-superseded/migrations/0001_init.sql`.

## Suggested order
1. Extract `Repo` interfaces; IndexedDB implementation unchanged.
2. Add `clinic_id` and `version` to models.
3. Finish the schema for the remaining tables.
4. Import the backup JSON into PostgreSQL as a one-off script.
5. Server-side auth and permission checks (separate decision).
