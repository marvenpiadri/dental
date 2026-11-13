#!/usr/bin/env node
// One-off import: turns a Dontalist backup file (Settings > Data and backup) into SQL for the schema in db/migrations.
//   node tools/backup-to-sql.mjs backup.json [clinic-id] > import.sql      then:  psql -f import.sql
// Counts and warnings go to stderr. References to rows that are not in the backup are nulled (optional ones) or the row is skipped (required ones), never invented.
import { readFileSync } from 'node:fs';

const [file, argId] = process.argv.slice(2);
if (!file) { console.error('usage: backup-to-sql.mjs backup.json [clinic-id]'); process.exit(2); }
const raw = JSON.parse(readFileSync(file, 'utf8'));
if (!['dontalist', 'dentaleus'].includes(raw.app) || raw.version !== 1) { console.error('not a Dontalist backup (app/version)'); process.exit(2); }

const out = []; const warn = []; const count = {};
const q = (v) => (v === undefined || v === null || v === '' ? 'null' : typeof v === 'number' ? (Number.isFinite(v) ? String(v) : 'null') : typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const j = (v) => (v === undefined || v === null ? 'null' : `${q(JSON.stringify(v))}::jsonb`);
const arr = (v) => `array[${(Array.isArray(v) ? v : []).map(q).join(',')}]::text[]`;
const day = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? q(v.slice(0, 10)) : 'null');
const ts = (v) => (v && !Number.isNaN(new Date(v).getTime()) ? q(new Date(v).toISOString()) : 'null');
const cur = (v) => (typeof v === 'string' && /^[A-Z]{3}$/.test(v) ? q(v) : 'null');
const cc = (v) => (typeof v === 'string' && /^[A-Za-z]{2}$/.test(v) ? q(v.toUpperCase()) : 'null');
const list = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
const insert = (table, cols, rows) => { for (const r of rows) out.push(`insert into ${table} (${cols.join(', ')}) values (${r.join(', ')});`); count[table] = (count[table] ?? 0) + rows.length; };
const ids = (rows) => new Set(rows.map((r) => r.id));

const locs = list(raw.locations);
const clinicId = argId ?? locs[0]?.id ?? crypto.randomUUID();
const C = q(clinicId);
const patients = list(raw.patients), dentists = list(raw.dentists), chairs = list(raw.chairs), appts = list(raw.appointments);
const patientIds = ids(patients), dentistIds = ids(dentists), chairIds = ids(chairs), locIds = ids(locs);
const apptIds = new Set();
const opt = (set, id, what) => { if (!id) return 'null'; if (set.has(id)) return q(id); warn.push(`${what}: reference ${id} not in backup, left empty`); return 'null'; };

out.push('begin;', `select set_config('app.clinic_id', ${C}, true);`);
insert('clinic', ['id', 'name'], [[C, q(locs[0]?.name ?? 'Dontalist')]]);

insert('location', ['id', 'clinic_id', 'name', 'code', 'address', 'timezone', 'active', 'hours', 'phone', 'email', 'website', 'country_code', 'city', 'postal_code', 'currency', 'payer_types', 'legal_name', 'tax_id', 'bank', 'invoice_note', 'logo', 'slug', 'profile'],
  locs.map((l) => [q(l.id), C, q(l.name), q(l.code || l.id), q(l.address), q(l.timezone || 'UTC'), q(l.active !== false), j(l.hours), q(l.phone), q(l.email), q(l.website), cc(l.countryCode), q(l.city), q(l.postalCode), cur(l.currency), arr(l.payerTypes), q(l.legalName), q(l.taxId), q(l.bank), q(l.invoiceNote), q(l.logo), q(l.profile?.slug), j(l.profile)]));
const payerIds = new Set();
insert('payer', ['id', 'clinic_id', 'type', 'name', 'hidden'], locs.flatMap((l) => list(l.payers)).filter((p) => !payerIds.has(p.id) && payerIds.add(p.id)).map((p) => [q(p.id), C, q(p.type), q(p.name), q(!!p.hidden)]));
insert('dentist', ['id', 'clinic_id', 'location_id', 'name', 'specialty', 'color', 'open_time', 'close_time', 'phone', 'email', 'registration', 'photo'],
  dentists.map((d) => [q(d.id), C, opt(locIds, d.locationId, 'dentist'), q(d.name), q(d.specialty ?? ''), q(d.color ?? ''), q(d.hours?.open), q(d.hours?.close), q(d.phone), q(d.email), q(d.registration), q(d.photo)]));
insert('chair', ['id', 'clinic_id', 'location_id', 'name', 'color'], chairs.map((c) => [q(c.id), C, opt(locIds, c.locationId, 'chair'), q(c.name), q(c.color)]));
insert('procedure_catalog', ['id', 'clinic_id', 'name', 'price'], list(raw.catalog).map((e) => [q(e.id), C, q(e.name), q(e.price ?? 0)]));

const s = raw.settings ?? {};
const meds = list(s.medications).sort((a, b) => (a.kind === 'generic' ? 0 : 1) - (b.kind === 'generic' ? 0 : 1));
const medIds = ids(meds);
insert('med_library', ['id', 'clinic_id', 'kind', 'name', 'notes', 'external_id', 'hidden', 'generic_id', 'review_conditions'], meds.map((m) => [q(m.id), C, q(m.kind), q(m.name), q(m.notes), q(m.externalId), q(!!m.hidden), opt(medIds, m.genericId, 'medication'), arr(m.reviewConditions)]));
const allergyDefs = list(s.allergyDefs); const allergyIds = ids(allergyDefs);
insert('allergy_def', ['id', 'clinic_id', 'name', 'medication_id', 'external_id', 'hidden'], allergyDefs.map((a) => [q(a.id), C, q(a.name), opt(medIds, a.medicationId, 'allergy'), q(a.externalId), q(!!a.hidden)]));
const templates = list(s.rxTemplates); const templateIds = ids(templates);
insert('rx_template', ['id', 'clinic_id', 'name', 'description', 'items', 'updated_at'], templates.map((t) => [q(t.id), C, q(t.name), q(t.description), j(t.items ?? []), ts(t.updatedAt) === 'null' ? 'now()' : ts(t.updatedAt)]));
insert('insurance_provider', ['id', 'clinic_id', 'name', 'short', 'kind'], list(s.insuranceProviders).map((p) => [q(p.id), C, q(p.name), q(p.short), q(p.kind ?? 'other')]));
insert('clinic_setting', ['clinic_id', 'key', 'value'], ['prefs', 'waTemplates', 'hiddenPages', 'view3d', 'docTemplates', 'docDefaults'].filter((k) => s[k] !== undefined).map((k) => [C, q(k), j(s[k])]));
const ROLES = ['owner', 'admin', 'dentist', 'assistant', 'reception', 'accountant'];
insert('staff', ['id', 'clinic_id', 'name', 'role', 'job_title', 'extra_permissions', 'removed_permissions', 'suspended_at', 'suspended_reason'],
  list(s.staff).filter((m) => ROLES.includes(m.role) || (warn.push(`staff ${m.id} skipped: unknown role`), false)).map((m) => [q(m.id), C, q(m.name), q(m.role), q(m.jobTitle), arr(m.extra), arr(m.removed), ts(m.suspendedAt), q(m.suspendedReason)]));
insert('staff_event', ['clinic_id', 'at', 'by_staff', 'action', 'target', 'detail'], list(s.staffLog).map((e) => [C, ts(e.at), q(e.by ?? 'import'), q(e.action), q(e.target ?? ''), q(e.detail)]));
if (list(s.staff).length) warn.push('staff PIN hashes not migrated: credentials come with the server sign-in design');

insert('patient', ['id', 'clinic_id', 'full_name', 'phone', 'email', 'birth_date', 'sex', 'country_code', 'city', 'alert', 'notes', 'photo', 'medical', 'odontogram', 'whatsapp_consent', 'whatsapp_consent_at', 'created_at', 'archived_at'],
  patients.map((p) => [q(p.id), C, q(p.fullName), q(p.phone ?? ''), q(p.email), day(p.birthDate), q(p.sex), cc(p.country), q(p.city), q(p.alert), q(p.notes), q(p.photo), j(p.medical), j(p.odontogram), q(p.whatsappConsent), ts(p.whatsappConsentAt), ts(p.createdAt) === 'null' ? 'now()' : ts(p.createdAt), ts(p.archivedAt)]));

const skipAppt = [];
const okAppts = appts.filter((a) => {
  const ok = patientIds.has(a.patientId) && dentistIds.has(a.dentistId) && chairIds.has(a.chairId);
  if (!ok) skipAppt.push(a.id); else apptIds.add(a.id);
  return ok;
});
if (skipAppt.length) warn.push(`${skipAppt.length} appointment(s) skipped: patient, dentist or chair missing (${skipAppt.slice(0, 3).join(', ')}…)`);
insert('appointment', ['id', 'clinic_id', 'location_id', 'patient_id', 'dentist_id', 'chair_id', 'type', 'status', 'starts_at', 'ends_at', 'reason', 'note', 'encounter_id', 'reminded_at', 'created_at', 'created_by'],
  okAppts.map((a) => [q(a.id), C, opt(locIds, a.locationId, 'appointment'), q(a.patientId), q(a.dentistId), q(a.chairId), q(a.type), q(a.status), ts(a.start), ts(a.end), q(a.reason), q(a.note), q(a.encounterId), ts(a.remindedAt), ts(a.createdAt), q(a.createdBy ?? 'import')]));
insert('appointment_status_change', ['clinic_id', 'appointment_id', 'from_status', 'to_status', 'at', 'by'], okAppts.flatMap((a) => list(a.history).map((h) => [C, q(a.id), q(h.from), q(h.to), ts(h.at), q(h.by ?? 'import')])));
insert('appointment_schedule_change', ['clinic_id', 'appointment_id', 'at', 'by', 'from_start', 'to_start', 'from_dentist_id', 'to_dentist_id', 'from_chair_id', 'to_chair_id'], okAppts.flatMap((a) => list(a.scheduleHistory).map((h) => [C, q(a.id), ts(h.at), q(h.by ?? 'import'), ts(h.fromStart), ts(h.toStart), q(h.fromDentistId), q(h.toDentistId), q(h.fromChairId), q(h.toChairId)])));

const each = (key) => patients.flatMap((p) => list(p[key]).map((x) => [p, x]));
insert('examination', ['id', 'clinic_id', 'patient_id', 'exam_date', 'examiner', 'note', 'chart'], each('examinations').map(([p, e]) => [q(e.id), C, q(p.id), day(e.date), q(e.examiner), q(e.note), j(e.chart)]));
insert('treatment_item', ['id', 'clinic_id', 'patient_id', 'tooth', 'scope', 'quadrant', 'procedure', 'name', 'price', 'currency', 'status', 'planned_on', 'done_at', 'appointment_id'],
  each('plan').map(([p, i]) => [q(i.id), C, q(p.id), q(i.tooth), q(i.scope), q(i.quadrant), q(i.procedure), q(i.name), q(i.price ?? 0), cur(i.currency), q(i.status), day(i.date), ts(i.doneAt), opt(apptIds, i.appointmentId, 'plan item')]));
insert('plan_proposal', ['id', 'clinic_id', 'patient_id', 'version_no', 'at', 'lines', 'total', 'status', 'decided_at'], each('proposals').map(([p, x]) => [q(x.id), C, q(p.id), q(x.version), ts(x.at), j(x.lines ?? []), q(x.total ?? 0), q(x.status), ts(x.decidedAt)]));
const invoices = each('invoices');
insert('invoice', ['id', 'clinic_id', 'patient_id', 'number', 'kind', 'issued_at', 'total', 'currency', 'cancelled_at', 'cancel_reason'], invoices.map(([p, i]) => [q(i.id), C, q(p.id), q(i.number), q(i.kind), ts(i.issuedAt), q(i.total ?? 0), cur(i.currency) === 'null' ? q(locs[0]?.currency ?? 'MAD') : cur(i.currency), ts(i.cancelledAt), q(i.cancelReason)]));
for (const [, i] of invoices) if (i.cancelsId) out.push(`update invoice set cancels_id = ${q(i.cancelsId)} where id = ${q(i.id)};`);
insert('invoice_line', ['clinic_id', 'invoice_id', 'item_id', 'label', 'location_label', 'price'], invoices.flatMap(([, i]) => list(i.lines).map((l) => [C, q(i.id), q(l.itemId), q(l.label), q(l.where), q(l.price ?? 0)])));
const invoiceIds = new Set(invoices.map(([, i]) => i.id));
insert('payment', ['id', 'clinic_id', 'patient_id', 'invoice_id', 'amount', 'currency', 'method', 'paid_at', 'reference', 'note', 'payer_type', 'payer_id', 'voided_at', 'void_reason'],
  each('payments').map(([p, x]) => [q(x.id), C, q(p.id), opt(invoiceIds, x.invoiceId, 'payment'), q(x.amount), cur(x.currency) === 'null' ? q(locs[0]?.currency ?? 'MAD') : cur(x.currency), q(x.method), ts(x.at), q(x.reference), q(x.note), q(x.payerType), opt(payerIds, x.payerId, 'payment'), ts(x.voidedAt), q(x.voidReason)]));
insert('visit_note', ['id', 'clinic_id', 'patient_id', 'at', 'appointment_id', 'dentist_id', 'complaint', 'findings', 'care', 'prescription', 'revisions', 'voided_at', 'void_reason'], each('visits').map(([p, v]) => [q(v.id), C, q(p.id), ts(v.at), opt(apptIds, v.appointmentId, 'visit'), opt(dentistIds, v.dentistId, 'visit'), q(v.complaint), q(v.findings), q(v.care), j(v.prescription), j(v.revisions), ts(v.voidedAt), q(v.voidReason)]));
insert('message', ['id', 'clinic_id', 'patient_id', 'at', 'kind', 'body', 'status', 'appointment_id', 'external_id'], each('messages').map(([p, m]) => [q(m.id), C, q(p.id), ts(m.at), q(m.kind), q(m.text), q(m.status), opt(apptIds, m.appointmentId, 'message'), q(m.externalId)]));
insert('letter', ['id', 'clinic_id', 'patient_id', 'at', 'kind', 'dentist_id', 'addressee', 'rest_days', 'body'], each('letters').map(([p, l]) => [q(l.id), C, q(p.id), ts(l.at), q(l.kind), opt(dentistIds, l.dentistId, 'letter'), q(l.to), q(l.restDays), q(l.text)]));
const rx = each('prescriptions'); const rxIds = new Set(rx.map(([, r]) => r.id));
insert('prescription', ['id', 'clinic_id', 'patient_id', 'number', 'status', 'created_at', 'updated_at', 'issued_at', 'dentist_id', 'appointment_id', 'template_id', 'items', 'notes', 'snapshot', 'acknowledged', 'correction_reason', 'voided_at', 'void_reason'],
  rx.map(([p, r]) => [q(r.id), C, q(p.id), q(r.number), q(r.status), ts(r.createdAt), ts(r.updatedAt), ts(r.issuedAt), opt(dentistIds, r.dentistId, 'prescription'), opt(apptIds, r.appointmentId, 'prescription'), opt(templateIds, r.templateId, 'prescription'), j(r.items ?? []), q(r.notes), j(r.snapshot), arr(r.acknowledged), q(r.correctionReason), ts(r.voidedAt), q(r.voidReason)]));
for (const [, r] of rx) { if (r.correctsId && rxIds.has(r.correctsId)) out.push(`update prescription set corrects_id = ${q(r.correctsId)} where id = ${q(r.id)};`); if (r.supersededById && rxIds.has(r.supersededById)) out.push(`update prescription set superseded_by_id = ${q(r.supersededById)} where id = ${q(r.id)};`); }
const pa = each('patientAllergies').filter(([, a]) => allergyIds.has(a.allergyId) || (warn.push(`patient allergy ${a.id} skipped: allergy ${a.allergyId} not in library`), false));
insert('patient_allergy', ['id', 'clinic_id', 'patient_id', 'allergy_id', 'label', 'reaction', 'reaction_date', 'active', 'created_at', 'removed_at', 'legacy_text'], pa.map(([p, a]) => [q(a.id), C, q(p.id), q(a.allergyId), q(a.label), q(a.reaction), day(a.reactionDate), q(!!a.active), ts(a.createdAt), ts(a.removedAt), q(a.legacyText)]));
const pm = each('patientMedications').filter(([, m]) => medIds.has(m.medicationId) || (warn.push(`patient medication ${m.id} skipped: medication ${m.medicationId} not in library`), false));
insert('patient_medication', ['id', 'clinic_id', 'patient_id', 'medication_id', 'label', 'notes', 'start_date', 'stop_date', 'active', 'source', 'prescription_id', 'created_at', 'removed_at', 'legacy_text'], pm.map(([p, m]) => [q(m.id), C, q(p.id), q(m.medicationId), q(m.label), q(m.notes), day(m.start), day(m.stop), q(!!m.active), q(m.source), opt(rxIds, m.prescriptionId, 'patient medication'), ts(m.createdAt), ts(m.removedAt), q(m.legacyText)]));
insert('record_audit', ['clinic_id', 'record_type', 'record_id', 'at', 'what', 'note'], [...pa.map(([, a]) => ['patient_allergy', a]), ...pm.map(([, m]) => ['patient_medication', m])].flatMap(([type, r]) => list(r.history).map((h) => [C, q(type), q(r.id), ts(h.at), q(h.what), q(h.note)])));
insert('patient_insurance', ['id', 'clinic_id', 'patient_id', 'provider_id', 'provider_name', 'member_number', 'policy_ref', 'notes', 'added_at'], each('insurances').map(([p, i]) => [q(i.id), C, q(p.id), q(i.providerId), q(i.providerName), q(i.number), q(i.policy), q(i.notes), ts(i.addedAt)]));

const docs = list(raw.documents).filter((d) => patientIds.has(d.patientId));
insert('patient_document', ['id', 'clinic_id', 'patient_id', 'name', 'mime_type', 'size_bytes', 'tooth', 'added_at', 'content'], docs.map((d) => [q(d.id), C, q(d.patientId), q(d.name), q(d.type || 'application/octet-stream'), q(d.size ?? 0), q(d.tooth), ts(d.addedAt), typeof d.data === 'string' && d.data.includes(',') ? `decode(${q(d.data.slice(d.data.indexOf(',') + 1))}, 'base64')` : 'null']));

const pr = raw.practice ?? {};
const known = (r, label) => patientIds.has(r.patientId) || (warn.push(`${label} ${r.id} skipped: patient missing`), false);
insert('expense', ['id', 'clinic_id', 'day', 'label', 'amount', 'currency'], list(pr.expenses).map((e) => [q(e.id), C, day(e.day), q(e.label), q(e.amount ?? 0), q(locs[0]?.currency ?? null)]));
insert('stock_item', ['id', 'clinic_id', 'name', 'qty', 'min_qty'], list(pr.stock).map((x) => [q(x.id), C, q(x.name), q(x.qty ?? 0), q(x.min ?? 0)]));
insert('task', ['id', 'clinic_id', 'body', 'done'], list(pr.tasks).map((x) => [q(x.id), C, q(x.text), q(!!x.done)]));
insert('implant_record', ['id', 'clinic_id', 'patient_id', 'tooth', 'brand', 'lot', 'day'], list(pr.implants).filter((r) => known(r, 'implant')).map((x) => [q(x.id), C, q(x.patientId), q(x.tooth), q(x.brand), q(x.lot), day(x.day)]));
insert('sterilization_cycle', ['id', 'clinic_id', 'day', 'device', 'lot', 'operator'], list(pr.steril).map((x) => [q(x.id), C, day(x.day), q(x.device), q(x.lot), q(x.operator)]));
insert('lab_order', ['id', 'clinic_id', 'patient_id', 'work', 'lab', 'due', 'status', 'tooth', 'shade'], list(pr.lab).filter((r) => known(r, 'lab order')).map((x) => [q(x.id), C, q(x.patientId), q(x.work), q(x.lab), day(x.due), q(x.status), q(x.tooth), q(x.shade)]));

out.push('commit;');
console.log(out.join('\n'));
console.error(Object.entries(count).filter(([, n]) => n).map(([t, n]) => `${t}: ${n}`).join('\n'));
if (warn.length) console.error('\nWarnings:\n' + [...new Set(warn)].slice(0, 40).join('\n'));
