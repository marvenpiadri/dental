# Dontalist domain model and Phase 3 readiness

Phase 2 is local only (IndexedDB in the browser). This file records what each record is, who owns it, and what Phase 3 (PostgreSQL + API) must do about it. Nothing here is implemented as a backend.

## Canonical entities and owners

| Entity | Source of truth today | Owner / key | Phase 3 table |
|---|---|---|---|
| Clinic location, chair, dentist | `locations`, `chairs`, `dentists` stores | clinic | `locations`, `chairs`, `staff` |
| Patient (identity, contact, medical alert, WhatsApp consent) | `patients` store | clinic | `patients` |
| Appointment | `appointments` store, `patientId`, optional `encounterId` | patient | `appointments` |
| Visit note (encounter record, prescription lines) | `Patient.visits[]` | patient, optional `appointmentId` | `encounters`, `prescription_lines` |
| Odontogram + periodontogram | `Patient.odontogram` (current chart) | patient | `chart_teeth`, `chart_perio_sites` |
| Examination snapshot | `Patient.examinations[]` (frozen charts) | patient | `examinations` (+ JSON snapshot) |
| Treatment plan item (planned / done) | `Patient.plan[]` | patient | `procedures` |
| Invoice and credit note | `Patient.invoices[]` | patient | `invoices`, `invoice_lines` |
| Payment | `Patient.payments[]` | patient, optional `invoiceId` | `payments` |
| Letter (certificate, referral) | `Patient.letters[]` | patient | `letters` |
| WhatsApp message | `Patient.messages[]` | patient, optional `appointmentId` | `messages` |
| Patient file (X-ray, photo, report) | `documents` store (binary) | patient, optional tooth | `documents` + object storage |
| Expense, stock, lab order, sterilization cycle, implant record, task | practice store | clinic (implant record and lab order reference a patient) | one table each |

## Rules the code already enforces (keep them in SQL)

- **Money is derived, never stored.** Charged = sum of `done` plan items; paid = sum of payments that are not voided; due = charged - paid (`treatment-rules.ts` `balance`). Phase 3 must keep these as queries or views, not columns.
- **An invoice is immutable.** Lines are copied when it is issued. Cancelling marks it (`cancelledAt`, `cancelReason`) and inserts a credit note (`AV-YYYY-NNNN`) pointing at it. A cancelled invoice's acts can be invoiced again under a new number. Numbers are gap-free per kind and year: use a counter table with a unique `(kind, year, seq)`, never `max()+1` under concurrency.
- **A payment is never deleted.** Voiding sets `voidedAt` and `voidReason`; reports and balances skip voided rows. A payment can point at one invoice (`invoiceId`) or be an advance (no invoice).
- **Letters and messages are append-only.**
- **A message record is `prepared` in Phase 2** (the receptionist presses send in WhatsApp). Phase 3 moves it to sent, delivered, read or failed from Meta webhooks and fills `externalId`.
- **WhatsApp consent**: `declined` blocks all messages; unset allows a manual one; automated sending in Phase 3 must require `granted`.
- **Examinations are historical.** Editing the current chart never changes a stored examination.

## Persistence inconsistencies to fix in Phase 3

1. **Patient is one fat record.** Plan, payments, invoices, visits, letters, messages, examinations and the whole chart are arrays inside the patient. Split into child tables with `patient_id` and `created_at`; keep `id`s as UUIDs (already generated client-side).
2. **Chart is an opaque blob** (`odontogram?: unknown`, versioned by `PAYLOAD_VERSION`). Phase 3 can keep it as `jsonb` first and normalise teeth and perio sites later; the vendored FHIR export (`engine/vendor/fhir`) is the interchange format.
3. **Clinical data lives in `Patient.visits`.** Visits map to `encounters`; there is no separate forms store.
4. **Appointment to encounter link is one way** (`appointment.encounterId`, `visit.appointmentId`). Make `encounters.appointment_id` the single foreign key and drop the other.
5. **Acts hold free text for the tooth** (`tooth`, scope text) next to structured scope fields. Normalise to `procedure_teeth(procedure_id, tooth)` and keep the text as display only.
6. **Single currency (MAD) and no tax fields.** Add `currency` on payments and invoices and VAT per line before a second country goes live.
7. **No author on writes.** Visits and letters carry `dentistId`; payments, invoices and voids do not. Add `created_by` and `voided_by` when auth arrives.
8. **Settings and templates** (WhatsApp wording) live in the i18n files. Move to a per-clinic `message_templates` table.
9. **Local-only audit trail:** `auditEvents` exists but is not written by billing actions. Write invoice issue/cancel and payment void there.

## Migration notes (documentation only)

- Export each patient with the existing JSON export, then load into the tables above; the client UUIDs become primary keys.
- Unknown `PaymentMethod` values (older data only had cash, card, transfer) map to `other`.
- Patients created before invoices have none: do not back-fill invoices; the balance does not depend on them.
- Backfill `voidedAt` as null and `invoiceId` as null on old payments; both are optional today.

## Integrations (design only)

**WhatsApp Business Cloud API, one account per clinic.** Table `clinic_whatsapp(clinic_id, waba_id, phone_number_id, access_token_ref, status)`. Tokens live in a secret store, never in the browser. Reminder sending becomes a server job reading `messages` rows in `prepared`/`queued`; delivery webhooks update `status`; inbound replies insert `messages` with direction `in`. Templates must be approved by Meta per clinic. Consent gate is `patients.whatsapp_consent = 'granted'`. No shared Dontalist number.

**Google Business Profile, one connection per clinic.** OAuth with the clinic's own Google account (Business Profile APIs). Store `clinic_google(clinic_id, account_id, location_id, refresh_token_ref, connected_at, last_sync_at)`. A sync job pulls name, address, hours, phone, categories, photos and reviews/ratings into `public_profile` tables; reviews are shown with Google attribution and refreshed per Google's display policy (no long-term copy beyond what the terms allow). The public SEO page `/c/:slug` renders from those tables and emits `Dentist`/`LocalBusiness` JSON-LD. The clinic can disconnect, which deletes tokens and cached Google content. Both integrations work with or without any marketing agency.

## Added since this note was written (frontend, for the backend design)

- Visit notes: `id`, `date`, `appointmentId?`, `content`, `revisions[]` (previous contents with timestamps), `voided?` with reason. Prescription lines: drug, dosage, duration, free text allowed.
- Appointment-to-act link: `TreatmentItem.appointmentId?` ties a planned or done act to the visit it was recorded in. Routine acts need no tooth or chart.
- Chair colour (`Chair.color?`) is a display field.
- Payments are offline records (method, reference, voided with reason); invoices are cancelled by credit note, numbers are never reused.
- Roles, permissions and the staff activity log are frontend-only today. The backend must own authentication, authorisation and an append-only audit log.
- This file remains a design note for a backend that does not exist yet.
