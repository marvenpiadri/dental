-- Dontalist, PostgreSQL schema, migration 0001.
-- Mirrors the browser models in src/app/denteus/models/dental.models.ts.
-- Conventions
--   * ids are text: the app mixes UUIDs with seed ids such as 'd1'.
--   * every table carries clinic_id (tenant) and mutable ones carry version + updated_at for conflict detection.
--   * money is numeric(14,2) with its own ISO 4217 currency; nothing is ever converted.
--   * foreign keys have no ON DELETE CASCADE where a row is history (payments, invoices, prescriptions): deleting what is referenced must fail.
--   * nested app structures that are only ever read and written whole stay jsonb; anything queried or constrained is a column or a table.
begin;
create extension if not exists btree_gist;   -- for the no-double-booking constraints

create table clinic (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table location (
  id text primary key,
  clinic_id text not null references clinic,
  name text not null,
  code text not null,
  address text,
  timezone text not null,
  active boolean not null default true,
  hours jsonb,                                   -- { open, close, days[] }
  phone text, email text, website text,
  country_code char(2) check (country_code ~ '^[A-Z]{2}$'),
  city text, postal_code text,
  currency char(3) check (currency ~ '^[A-Z]{3}$'),
  payer_types text[] not null default '{}',
  legal_name text, tax_id text, bank text, invoice_note text,
  logo text,                                     -- data URL today; move to object storage with documents
  slug text,                                     -- public page address, from profile.slug
  profile jsonb,                                 -- public profile; slug is copied out for uniqueness
  version int not null default 1,
  updated_at timestamptz not null default now(),
  unique (clinic_id, code)
);
create unique index location_slug_key on location (lower(slug)) where slug is not null;

create table payer (
  id text primary key,
  clinic_id text not null references clinic,
  type text not null check (type in ('patient','public','private','mutual','employer','other')),
  name text not null,
  hidden boolean not null default false
);
create unique index payer_name_key on payer (clinic_id, type, lower(name));

create table insurance_provider (               -- only the clinic's own additions; the national reference list is a static JSON file
  id text primary key,
  clinic_id text not null references clinic,
  name text not null,
  short text,
  kind text not null default 'other' check (kind in ('public','military','mutual','private','other'))
);
create unique index insurance_provider_name_key on insurance_provider (clinic_id, lower(name));

create table dentist (
  id text primary key,
  clinic_id text not null references clinic,
  location_id text references location,
  name text not null, specialty text not null default '', color text not null default '',
  open_time text, close_time text,
  phone text, email text, registration text, photo text,
  version int not null default 1, updated_at timestamptz not null default now()
);

create table chair (
  id text primary key,
  clinic_id text not null references clinic,
  location_id text references location,
  name text not null, color text
);

create table patient (
  id text primary key,
  clinic_id text not null references clinic,
  full_name text not null,
  phone text not null default '',
  email text, birth_date date,
  sex text check (sex in ('female','male')),
  country_code char(2) check (country_code ~ '^[A-Z]{2}$'),
  city text, alert text, notes text, photo text,
  medical jsonb,                                 -- conditions, free-text allergies/medications, legacyMatched
  odontogram jsonb,
  whatsapp_consent text check (whatsapp_consent in ('granted','declined')),
  whatsapp_consent_at timestamptz,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  version int not null default 1, updated_at timestamptz not null default now()
);
create index patient_name_idx on patient (clinic_id, lower(full_name));
create index patient_phone_idx on patient (clinic_id, phone);

create table patient_insurance (                -- who covers the patient; not a claim, not a payment
  id text primary key,
  clinic_id text not null references clinic,
  patient_id text not null references patient,
  provider_id text not null,                     -- 'ma-cnss' (reference list) or an insurance_provider id; no FK because reference ids are not rows
  provider_name text not null,                   -- name when recorded, so the record reads the same if the list changes
  member_number text not null,
  policy_ref text, notes text,
  added_at timestamptz not null default now()
);
create index patient_insurance_patient_idx on patient_insurance (patient_id);

create table examination (
  id text primary key,
  clinic_id text not null references clinic,
  patient_id text not null references patient,
  exam_date date not null, examiner text, note text,
  chart jsonb not null
);
create index examination_patient_idx on examination (patient_id, exam_date);

create table appointment (
  id text primary key,
  clinic_id text not null references clinic,
  location_id text references location,
  patient_id text not null references patient,
  dentist_id text not null references dentist,
  chair_id text not null references chair,
  type text not null,
  status text not null check (status in ('scheduled','confirmed','arrived','in-progress','completed','cancelled','no-show')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text, note text, encounter_id text,
  reminded_at timestamptz,
  created_at timestamptz not null,
  created_by text not null,
  version int not null default 1, updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index appointment_day_idx on appointment (clinic_id, starts_at);
create index appointment_patient_idx on appointment (patient_id, starts_at);
-- A chair or a dentist cannot be double-booked by live appointments.
alter table appointment add constraint appointment_chair_free exclude using gist (chair_id with =, tstzrange(starts_at, ends_at) with &&) where (status not in ('cancelled','no-show'));
alter table appointment add constraint appointment_dentist_free exclude using gist (dentist_id with =, tstzrange(starts_at, ends_at) with &&) where (status not in ('cancelled','no-show'));

create table appointment_status_change (
  id bigserial primary key,
  clinic_id text not null references clinic,
  appointment_id text not null references appointment,
  from_status text, to_status text not null, at timestamptz not null, by text not null
);
create table appointment_schedule_change (
  id bigserial primary key,
  clinic_id text not null references clinic,
  appointment_id text not null references appointment,
  at timestamptz not null, by text not null,
  from_start timestamptz not null, to_start timestamptz not null,
  from_dentist_id text not null, to_dentist_id text not null,
  from_chair_id text not null, to_chair_id text not null
);

create table procedure_catalog (
  id text not null, clinic_id text not null references clinic,
  name text, price numeric(14,2) not null check (price >= 0),
  primary key (clinic_id, id)
);

create table treatment_item (
  id text primary key,
  clinic_id text not null references clinic,
  patient_id text not null references patient,
  tooth text, scope text check (scope in ('quadrant','upper','lower','mouth')),
  quadrant smallint check (quadrant between 1 and 4),
  procedure text not null, name text,
  price numeric(14,2) not null check (price >= 0),
  currency char(3) check (currency ~ '^[A-Z]{3}$'),   -- null = the clinic's currency at the time (see regional-rules planInCurrency)
  status text not null check (status in ('planned','done')),
  planned_on date, done_at timestamptz,
  appointment_id text references appointment,
  version int not null default 1, updated_at timestamptz not null default now()
);
create index treatment_item_patient_idx on treatment_item (patient_id);

create table plan_proposal (
  id text primary key,
  clinic_id text not null references clinic,
  patient_id text not null references patient,
  version_no int not null,
  at timestamptz not null,
  lines jsonb not null,                          -- frozen copy of the quote
  total numeric(14,2) not null,
  status text not null check (status in ('proposed','accepted','declined','superseded')),
  decided_at timestamptz,
  unique (patient_id, version_no)
);

create table invoice (
  id text primary key,
  clinic_id text not null references clinic,
  patient_id text not null references patient,
  number text not null,
  kind text not null check (kind in ('invoice','credit-note')),
  issued_at timestamptz not null,
  total numeric(14,2) not null,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  cancels_id text references invoice,
  cancelled_at timestamptz, cancel_reason text,
  unique (clinic_id, number)
);
create table invoice_line (
  id bigserial primary key,
  clinic_id text not null references clinic,
  invoice_id text not null references invoice,
  item_id text not null,                         -- treatment_item id; no FK, an item can be removed after it was billed
  label text not null, location_label text,
  price numeric(14,2) not null
);

create table payment (                           -- money received by the clinic, from a payer; never an insurer's decision
  id text primary key,
  clinic_id text not null references clinic,
  patient_id text not null references patient,
  invoice_id text references invoice,
  amount numeric(14,2) not null check (amount > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  method text not null check (method in ('cash','card','transfer','cheque','other')),
  paid_at timestamptz not null,
  reference text, note text,
  payer_type text check (payer_type in ('patient','public','private','mutual','employer','other')),
  payer_id text references payer,
  voided_at timestamptz, void_reason text
);
create index payment_patient_idx on payment (patient_id, paid_at);

create table visit_note (
  id text primary key,
  clinic_id text not null references clinic,
  patient_id text not null references patient,
  at timestamptz not null,
  appointment_id text references appointment, dentist_id text references dentist,
  complaint text, findings text, care text,
  prescription jsonb, revisions jsonb,
  voided_at timestamptz, void_reason text
);
create table message (
  id text primary key,
  clinic_id text not null references clinic,
  patient_id text not null references patient,
  at timestamptz not null,
  kind text not null check (kind in ('appointment','balance','recall')),
  body text not null,
  status text not null check (status in ('prepared','sent','delivered','read','failed')),
  appointment_id text references appointment, external_id text
);
create table letter (
  id text primary key,
  clinic_id text not null references clinic,
  patient_id text not null references patient,
  at timestamptz not null,
  kind text not null check (kind in ('certificate','referral')),
  dentist_id text references dentist, addressee text, rest_days int, body text not null
);

create table patient_document (
  id text primary key,
  clinic_id text not null references clinic,
  patient_id text not null references patient,
  name text not null, mime_type text not null, size_bytes bigint not null,
  tooth text, added_at timestamptz not null,
  content bytea                                  -- until object storage is chosen; keep out of list queries
);

-- Medication and allergy libraries (see docs/medication-allergy-library.md)
create table med_library (
  id text primary key,
  clinic_id text not null references clinic,
  kind text not null check (kind in ('generic','brand')),
  name text not null, notes text, external_id text,
  hidden boolean not null default false,
  generic_id text references med_library,
  review_conditions text[] not null default '{}',
  check ((kind = 'brand') = (generic_id is not null)),
  version int not null default 1, updated_at timestamptz not null default now()
);
create unique index med_library_name_key on med_library (clinic_id, kind, lower(name));
create table allergy_def (
  id text primary key,
  clinic_id text not null references clinic,
  name text not null, medication_id text references med_library, external_id text,
  hidden boolean not null default false,
  version int not null default 1, updated_at timestamptz not null default now()
);
create unique index allergy_def_name_key on allergy_def (clinic_id, lower(name));
create table rx_template (
  id text primary key,
  clinic_id text not null references clinic,
  name text not null, description text, items jsonb not null,
  updated_at timestamptz not null
);
create table prescription (                      -- issued rows change only by void or supersede
  id text primary key,
  clinic_id text not null references clinic,
  patient_id text not null references patient,
  number text,
  status text not null check (status in ('draft','issued','voided','superseded')),
  created_at timestamptz not null, updated_at timestamptz not null, issued_at timestamptz,
  dentist_id text references dentist, appointment_id text references appointment,
  template_id text references rx_template,
  items jsonb not null, notes text, snapshot jsonb, acknowledged text[],
  corrects_id text references prescription, correction_reason text,
  superseded_by_id text references prescription,
  voided_at timestamptz, void_reason text,
  unique (clinic_id, number)
);
create table patient_allergy (
  id text primary key,
  clinic_id text not null references clinic,
  patient_id text not null references patient,
  allergy_id text not null references allergy_def,   -- no cascade: an allergy in use cannot be deleted
  label text not null, reaction text, reaction_date date,
  active boolean not null, created_at timestamptz not null, removed_at timestamptz, legacy_text text
);
create table patient_medication (
  id text primary key,
  clinic_id text not null references clinic,
  patient_id text not null references patient,
  medication_id text not null references med_library,
  label text not null, notes text, start_date date, stop_date date,
  active boolean not null,
  source text check (source in ('manual','prescribed','reported')),
  prescription_id text references prescription,
  created_at timestamptz not null, removed_at timestamptz, legacy_text text
);
create table record_audit (                      -- history of patient allergy / medication records
  id bigserial primary key,
  clinic_id text not null references clinic,
  record_type text not null check (record_type in ('patient_allergy','patient_medication')),
  record_id text not null,
  at timestamptz not null, what text not null, note text
);
create index record_audit_record_idx on record_audit (record_type, record_id);

-- Practice page
create table expense (id text primary key, clinic_id text not null references clinic, day date not null, label text not null, amount numeric(14,2) not null, currency char(3) check (currency ~ '^[A-Z]{3}$'));
create table stock_item (id text primary key, clinic_id text not null references clinic, name text not null, qty int not null, min_qty int not null);
create table task (id text primary key, clinic_id text not null references clinic, body text not null, done boolean not null default false);
create table implant_record (id text primary key, clinic_id text not null references clinic, patient_id text not null references patient, tooth text not null, brand text not null, lot text not null, day date not null);
create table sterilization_cycle (id text primary key, clinic_id text not null references clinic, day date not null, device text not null, lot text not null, operator text not null);
create table lab_order (id text primary key, clinic_id text not null references clinic, patient_id text not null references patient, work text not null, lab text not null, due date, status text not null check (status in ('sent','ready','fitted')), tooth text, shade text);

-- Preferences, templates, hidden pages: small documents keyed by name.
-- The browser's staff list (roles, PIN) is NOT migrated: sign-in and permissions need a server-side design first.
create table clinic_setting (
  clinic_id text not null references clinic,
  key text not null check (key in ('prefs','waTemplates','hiddenPages','view3d','docTemplates','docDefaults')),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (clinic_id, key)
);

create table schema_migration (version text primary key, applied_at timestamptz not null default now());
insert into schema_migration (version) values ('0001_init');
commit;
