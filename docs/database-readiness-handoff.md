# Dontalist database readiness handoff

**Date:** 10 November 2026  
**Branch reviewed:** `feat/patient-file-acts`  
**Purpose:** Hand the accepted local-first frontend to the database/backend phase without reopening frontend polish.

## Executive decision

The frontend is sufficiently established to begin database design and backend planning. It is **not** a drop-in remote-API client yet, and it does not need another broad UI audit to begin the next phase.

The existing application was intentionally built around browser persistence. The backend phase must replace the persistence boundary while preserving the accepted product workflows. Do not ask for another general redesign, calendar polish pass or broad browser test campaign as a prerequisite.

## Source-confirmed current architecture

### Persistence

- `DentalStore` is the central application-facing store for clinic records.
- `ClinicDatabase` is the IndexedDB adapter (`dental-clinic`, schema version 3).
- IndexedDB object stores currently include `locations`, `dentists`, `chairs`, `patients`, `appointments`, `documents`, `settings` and `auditEvents`.
- Patients and appointments are loaded into Angular signals. Patient clinical and financial collections are currently nested inside the patient record.
- Clinic resources, catalog and preferences are persisted through dedicated stores/settings.
- Appointment dates are serialised to ISO strings in IndexedDB and revived as JavaScript `Date` objects on load.
- Backup/restore exists and provides a useful migration/export starting point. It is not a substitute for a versioned server migration process.

### Domain records currently represented

- Clinic location, dentists and chairs.
- Patients and medical-history fields.
- Appointments and appointment history.
- Visit notes and revisions, including free-text prescription lines.
- Current odontogram payload and historical examination snapshots.
- Treatment-plan items and quote/proposal versions.
- Invoices, credit notes and payments.
- Letters and prepared WhatsApp messages.
- Patient documents.
- Practice records such as expenses, stock, lab orders, sterilisation, implants and tasks.
- Clinic settings, templates, team members and team activity log.

The detailed existing domain notes remain in `docs/domain-model.md`, but that file is a starting point, not a final migration specification.

## Important integration gaps to resolve in backend design

### 1. Persistence calls are not uniformly API-shaped

The comment in `DentalStore` says every mutation is async and returns an `ApiResult`, but the current implementation includes synchronous mutations such as `addPatient`, `updatePatient`, `setOdontogram`, `setPhoto`, `changePlan`, `changeProposals`, `changeLetters`, `markReminded` and `setArchived`. Some other operations are already async.

**Backend implication:** do not assume a one-to-one replacement of IndexedDB calls with HTTP. Before connecting a remote database, define a consistent application-facing repository/service contract, error handling, loading states and optimistic-update policy. Keep UI components away from raw database/HTTP details.

### 2. Patient is currently an aggregate with nested arrays

`Patient` currently carries plan items, payments, invoices, letters, messages, visits, proposals, examinations and the current odontogram. This is convenient for local-first operation but should not become one enormous relational patient row.

**Backend implication:** use a patient parent record and independently addressable child records with foreign keys and clinic ownership. Keep the odontogram as versioned JSONB initially if that is the least risky route; normalisation of chart findings can be a later evidence-based decision.

### 3. Clinic country is not yet a first-class clinic field

`ClinicLocation` currently has timezone and business identity fields. `countryCode` is present on `ClinicProfile`, which is a public-facing profile, not a reliable source of the clinic's legal/operating jurisdiction.

**Backend implication:** add a required ISO 3166-1 alpha-2 `country_code` to the clinic/account/location entity. Keep interface language, currency and time zone separate. Morocco is the first country pack. Do not infer country from language, city text or currency.

### 4. Current authentication is explicitly not production security

`AuthService` stores staff and a session identifier in browser storage and describes itself as a UI lock. Its permissions improve local UI behaviour but are not server authorisation.

**Backend implication:** production identity, password/session handling, staff membership, tenant isolation and permission checks must be enforced server-side. Never trust a clinic ID, staff ID, role or permission sent by the browser without checking it against the authenticated user.

### 5. Money and country assumptions need a deliberate migration rule

Current domain comments describe amounts as whole units of the clinic currency, and the existing domain notes identify MAD as the current assumption. Invoices/payments need explicit currency once more than one country is supported.

**Backend implication:** include ISO currency codes on monetary records from the start of the backend schema, default Moroccan clinics to MAD, and never reinterpret existing historical amounts silently. Tax/VAT rules should be country-pack configuration, not scattered UI conditionals.

### 6. Audit and historical integrity

Existing domain rules correctly call for immutable issued invoices, credit notes instead of destructive cancellation, non-deleted/voided payments, append-only letters/messages, and historical examination snapshots. The local audit event store is not consistently written by billing operations.

**Backend implication:** preserve these invariants with database constraints, transactions and server-side audit events. Add actor IDs and timestamps to important writes. Invoice numbering must be concurrency-safe; do not use `MAX()+1`.

### 7. Documents require separate file storage

Patient files currently store document bytes in browser IndexedDB/data URLs.

**Backend implication:** move file bytes to private object storage with database metadata, clinic/patient ownership, access checks, content-type/size validation and backup/retention policy. Do not store large base64 documents in ordinary relational rows.

## Recommended backend boundary

Use one universal CRM schema with a Morocco-first country-pack layer.

- **Tenant root:** clinic/account is the security boundary. Every clinic-owned record must be scoped to that tenant, directly or through a parent relationship.
- **Country:** clinic's ISO country code determines available country-specific capabilities; Morocco-only insurance workflows stay out of the universal CRM interface.
- **Core entities:** clinic, staff/membership, patients, appointments, encounters/visits, treatment-plan items, charts/examinations, invoices/lines, payments, documents and practice records.
- **Configuration:** clinic preferences, services/catalogue, chairs, staff permissions and templates.
- **Country packs:** country-specific fields, reference data and workflows, with documented source, verification date and limitations.
- **Files:** private object storage, not public URLs by default.
- **Audit:** server-authored audit history for clinical, financial, permission and administrative changes.

Do not create a table for every setting or every country. Derive the final table count from entities, ownership, history and query needs. The current 35–45 table estimate is not a target.

## Migration approach

1. Freeze the accepted frontend feature scope. No new UI polish is required just to begin schema design.
2. Treat current TypeScript models and IndexedDB data as the source material for a field-by-field mapping, not as a final SQL schema.
3. Define tenant ownership, IDs, timestamps, currency, country, soft-delete/void rules and audit authorship before migrations.
4. Design the relational schema and API contracts against the existing workflows.
5. Build an export/import migration from the current backup format, with validation and a dry-run report. Preserve original IDs where safe.
6. Introduce the remote repository/API adapter behind the existing application-facing services.
7. Migrate a test clinic backup and compare record counts, relationships, totals and document references before switching production.
8. Keep a rollback/export path until the remote system is proven.

## What does NOT block database design

- Completing another calendar animation or visual polish pass.
- Re-running every UI route through a broad browser audit.
- Adding speculative country packs beyond Morocco.
- Implementing every Moroccan insurer form before designing the universal schema.
- Building a full pharmacy catalogue before the prescription model is agreed.
- Choosing a final table count before mapping all current entities.

## Small decisions to settle before writing migrations

1. Confirm the production clinic/account tenancy model (the current product decision is one clinic/location per account).
2. Confirm the authentication provider and server-side membership model.
3. Confirm whether PostgreSQL + Supabase is the chosen backend platform, after checking file storage, auth, RLS and deployment needs.
4. Confirm the exact country/geographic reference dataset and licence before importing it.
5. Confirm the minimum Morocco V1 country-pack scope; do not block the universal schema on unfinished insurer research.

## Ownership and handoff

The product owner has completed the frontend scope and wants to take the project out of Claude's implementation loop.

**No further Claude work is required merely to start database design.** Use Claude again only if a specific code change genuinely requires its local environment or implementation capability. Database modelling, schema review, migration planning and backend architecture can now proceed as a separate phase.

This document is a source-level handoff, not a claim that a production backend, authentication system or migration has been implemented or tested.
