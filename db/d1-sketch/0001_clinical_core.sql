-- PROPOSAL ONLY (Phase 1). Not applied anywhere. Parses on SQLite (D1) and is written to port to MySQL 8.
-- ids: FlaresID as 19-digit zero-padded decimal TEXT. money: INTEGER minor units + ISO currency.
PRAGMA foreign_keys = ON;

CREATE TABLE clinic (
  id TEXT PRIMARY KEY CHECK (length(id) = 19),
  name TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  row_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE staff (
  clinic_id TEXT NOT NULL REFERENCES clinic(id),
  id TEXT NOT NULL CHECK (length(id) = 19),
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','dentist','assistant','reception')),
  PRIMARY KEY (clinic_id, id)
);

CREATE TABLE patient (
  clinic_id TEXT NOT NULL REFERENCES clinic(id),
  id TEXT NOT NULL CHECK (length(id) = 19),
  full_name TEXT NOT NULL,
  birth_date TEXT CHECK (birth_date IS NULL OR birth_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  phone_e164 TEXT,
  row_version INTEGER NOT NULL DEFAULT 1,
  archived_at TEXT,
  PRIMARY KEY (clinic_id, id)
);
CREATE INDEX patient_dup_phone ON patient (clinic_id, phone_e164);
CREATE INDEX patient_dup_name_birth ON patient (clinic_id, birth_date, full_name);

-- Catalogues: every coded value in the chart is an FK, so an unknown value is rejected by the database.
CREATE TABLE code_tooth_state (code TEXT PRIMARY KEY);          -- none, tooth-base, milktooth, implant, tooth-under-gum, ...
CREATE TABLE code_finding_kind (code TEXT PRIMARY KEY);         -- caries, filling, filling_defect, radiographic_depth, plaque, pi, gi, mpi, mbi
CREATE TABLE code_tooth_flag (code TEXT PRIMARY KEY);           -- calculus, fissureSealing, crownNeeded, ...
CREATE TABLE code_surface (code TEXT PRIMARY KEY);              -- M, D, B, L, O (I = incisal)

CREATE TABLE exam (
  clinic_id TEXT NOT NULL,
  id TEXT NOT NULL CHECK (length(id) = 19),
  patient_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('initial','periodic','perio','working')),
  exam_date TEXT NOT NULL,
  examiner_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','signed','superseded','voided')),
  supersedes_id TEXT,
  chart_version TEXT NOT NULL,               -- engine payload version it was read from
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  PRIMARY KEY (clinic_id, id),
  FOREIGN KEY (clinic_id, patient_id) REFERENCES patient (clinic_id, id),
  FOREIGN KEY (clinic_id, examiner_id) REFERENCES staff (clinic_id, id),
  FOREIGN KEY (clinic_id, supersedes_id) REFERENCES exam (clinic_id, id)
);
-- at most one initial examination per patient that is not voided
CREATE UNIQUE INDEX exam_one_initial ON exam (clinic_id, patient_id) WHERE kind = 'initial' AND status <> 'voided';
CREATE INDEX exam_by_patient ON exam (clinic_id, patient_id, exam_date DESC);

-- A row means "the clinician recorded this tooth". No row = unrecorded. Healthy is an explicit record, never a default.
CREATE TABLE exam_tooth (
  clinic_id TEXT NOT NULL,
  exam_id TEXT NOT NULL,
  tooth_fdi INTEGER NOT NULL CHECK (tooth_fdi BETWEEN 11 AND 48 AND tooth_fdi % 10 BETWEEN 1 AND 8),
  tooth_state TEXT NOT NULL REFERENCES code_tooth_state (code),
  substrate TEXT NOT NULL,
  restoration_type TEXT NOT NULL,
  restoration_material TEXT NOT NULL,
  endo TEXT NOT NULL,
  pulp_dx TEXT NOT NULL,
  apical_dx TEXT NOT NULL,
  mobility TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  PRIMARY KEY (clinic_id, exam_id, tooth_fdi),
  FOREIGN KEY (clinic_id, exam_id) REFERENCES exam (clinic_id, id)
);

CREATE TABLE exam_tooth_flag (
  clinic_id TEXT NOT NULL, exam_id TEXT NOT NULL, tooth_fdi INTEGER NOT NULL,
  flag TEXT NOT NULL REFERENCES code_tooth_flag (code),
  PRIMARY KEY (clinic_id, exam_id, tooth_fdi, flag),
  FOREIGN KEY (clinic_id, exam_id, tooth_fdi) REFERENCES exam_tooth (clinic_id, exam_id, tooth_fdi)
);

CREATE TABLE exam_surface_finding (
  clinic_id TEXT NOT NULL, exam_id TEXT NOT NULL, tooth_fdi INTEGER NOT NULL,
  kind TEXT NOT NULL REFERENCES code_finding_kind (code),
  surface TEXT NOT NULL REFERENCES code_surface (code),
  value_code TEXT NOT NULL,                 -- severity / material / grade as a code, never free text
  PRIMARY KEY (clinic_id, exam_id, tooth_fdi, kind, surface),
  FOREIGN KEY (clinic_id, exam_id, tooth_fdi) REFERENCES exam_tooth (clinic_id, exam_id, tooth_fdi)
);

CREATE TABLE exam_perio_site (
  clinic_id TEXT NOT NULL, exam_id TEXT NOT NULL, tooth_fdi INTEGER NOT NULL,
  site TEXT NOT NULL CHECK (site IN ('MB','B','DB','ML','L','DL')),
  probing_mm INTEGER NOT NULL CHECK (probing_mm BETWEEN 0 AND 20),
  margin_mm INTEGER NOT NULL DEFAULT 0 CHECK (margin_mm BETWEEN -10 AND 20),   -- CAL = probing + margin, derived, never stored
  bleeding INTEGER NOT NULL DEFAULT 0 CHECK (bleeding IN (0,1)),
  suppuration INTEGER NOT NULL DEFAULT 0 CHECK (suppuration IN (0,1)),
  PRIMARY KEY (clinic_id, exam_id, tooth_fdi, site),
  FOREIGN KEY (clinic_id, exam_id, tooth_fdi) REFERENCES exam_tooth (clinic_id, exam_id, tooth_fdi)
);

CREATE TABLE treatment_item (
  clinic_id TEXT NOT NULL, id TEXT NOT NULL, patient_id TEXT NOT NULL,
  tooth_fdi INTEGER, surface_set TEXT,
  procedure_code TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned','scheduled','cancelled')),   -- 'completed' is deliberately absent
  fee_minor INTEGER NOT NULL CHECK (fee_minor >= 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  row_version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (clinic_id, id),
  FOREIGN KEY (clinic_id, patient_id) REFERENCES patient (clinic_id, id)
);

CREATE TABLE procedure_performed (
  clinic_id TEXT NOT NULL, id TEXT NOT NULL, patient_id TEXT NOT NULL,
  treatment_item_id TEXT,
  performed_on TEXT NOT NULL, provider_id TEXT NOT NULL,
  fee_minor INTEGER NOT NULL CHECK (fee_minor >= 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  status TEXT NOT NULL CHECK (status IN ('completed','voided')),
  voided_reason TEXT,
  PRIMARY KEY (clinic_id, id),
  FOREIGN KEY (clinic_id, patient_id) REFERENCES patient (clinic_id, id),
  FOREIGN KEY (clinic_id, treatment_item_id) REFERENCES treatment_item (clinic_id, id),
  FOREIGN KEY (clinic_id, provider_id) REFERENCES staff (clinic_id, id),
  CHECK (status <> 'voided' OR voided_reason IS NOT NULL)
);

CREATE TABLE audit_event (
  clinic_id TEXT NOT NULL, id TEXT NOT NULL,
  at TEXT NOT NULL, actor_id TEXT NOT NULL,
  entity TEXT NOT NULL, entity_id TEXT NOT NULL,
  action TEXT NOT NULL, before_text TEXT, after_text TEXT,
  PRIMARY KEY (clinic_id, id)
);
CREATE INDEX audit_by_entity ON audit_event (clinic_id, entity, entity_id, at);
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_event BEGIN SELECT RAISE(ABORT, 'audit_event is append-only'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_event BEGIN SELECT RAISE(ABORT, 'audit_event is append-only'); END;

-- a signed exam is frozen
CREATE TRIGGER exam_tooth_frozen BEFORE UPDATE ON exam_tooth
WHEN (SELECT status FROM exam WHERE clinic_id = OLD.clinic_id AND id = OLD.exam_id) IN ('signed','superseded','voided')
BEGIN SELECT RAISE(ABORT, 'signed examination is immutable; create a superseding exam'); END;

CREATE TABLE import_quarantine (
  clinic_id TEXT NOT NULL, id TEXT NOT NULL,
  run_id TEXT NOT NULL, source_system TEXT NOT NULL, source_key TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('rejected','ambiguous','recovered')),
  reason TEXT NOT NULL, raw_sha256 TEXT NOT NULL, raw_r2_key TEXT NOT NULL,
  resolved_by TEXT, resolved_at TEXT,
  PRIMARY KEY (clinic_id, id),
  UNIQUE (clinic_id, source_system, source_key)
);

CREATE TABLE idempotency_key (
  clinic_id TEXT NOT NULL, scope TEXT NOT NULL, key TEXT NOT NULL,
  request_sha256 TEXT NOT NULL, result_id TEXT,
  PRIMARY KEY (clinic_id, scope, key)
);
