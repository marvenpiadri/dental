import { AuthService } from '../../core/auth/auth.service';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { I18n, Key } from '../../core/i18n/i18n.service';
import { Documents } from '../documents/documents.service';
import { Patient, Prescription, RxItem, RxSnapshot, RxTemplate } from '../models/dental.models';
import { DentalStore } from '../services/dental-store.service';
import { RxItemsComponent } from './rx-items.component';
import { RxLibrary } from './rx-library.service';
import { activeAllergies, activeMedications, audit } from './med-library';
import { rxHtml, RxDocLabels } from './rx-html';
import { IssueProblem, applyIssue, issueProblem, itemTitle, itemsFromTemplate, nextRxNumber, rxWarnings, startCorrection, tidyItem, voidPrescription } from './rx-rules';

/** The Prescriptions page of a patient file: history, two ways to start, the editor with safety notes, issue, correct and void. */
@Component({
  selector: 'den-rx-page',
  imports: [RxItemsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (draft(); as d) {
      <div class="editor">
        <div class="bar"><button type="button" class="btn" (click)="close()"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i>{{ t('rx.back') }}</button>
          @if (d.correctsId) { <span class="chip" data-tone="warn">{{ t('rx.corrects', { n: numberOf(d.correctsId) }) }}</span> }</div>
        @if (d.correctionReason) { <p class="hint">{{ t('rx.reason', { reason: d.correctionReason }) }}</p> }
        <div class="meta">
          <label class="field"><span class="label">{{ t('rx.prescriber') }}</span>
            <select class="input" (change)="patch({ dentistId: $any($event.target).value })" [attr.aria-invalid]="problem() === 'dentist' ? 'true' : null">
              <option value="" [selected]="!d.dentistId">—</option>
              @for (x of store.dentists(); track x.id) { <option [value]="x.id" [selected]="d.dentistId === x.id">{{ x.name }}</option> }
            </select></label>
          <label class="field"><span class="label">{{ t('rx.f.visit') }}</span>
            <select class="input" (change)="patch({ appointmentId: $any($event.target).value || undefined })">
              <option value="" [selected]="!d.appointmentId">—</option>
              @for (a of visits(); track a.id) { <option [value]="a.id" [selected]="d.appointmentId === a.id">{{ t('rx.appointment', { date: day(a.start.toISOString()) }) }}</option> }
            </select></label>
        </div>

        <den-rx-items [items]="d.items" (itemsChange)="patch({ items: $event })" />
        <label class="field"><span class="label">{{ t('rx.f.notes') }}</span><textarea class="input" rows="2" maxlength="500" [value]="d.notes ?? ''" (input)="patch({ notes: $any($event.target).value })"></textarea></label>

        <section class="warn" aria-live="polite">
          @for (w of warnings(); track w.id) {
            <div class="note" [attr.data-level]="w.level">
              <strong>{{ t(levelKey[w.level]) }}</strong><span>{{ t(w.key, w.params) }}</span>
              @if (w.level === 'critical') { <label class="check"><input type="checkbox" [checked]="(d.acknowledged ?? []).includes(w.id)" (change)="ack(w.id)" />{{ t('rx.ack') }}</label> }
            </div>
          }
          <p class="hint">{{ t('rx.w.limit2') }}</p>
        </section>

        @if (canRecord()) {
          <label class="check"><input type="checkbox" [checked]="record()" (change)="record.set($any($event.target).checked)" />{{ t('rx.recordMeds') }}</label>
        }
        @if (problem() && tried()) { <p class="error" role="alert">{{ t(problemKey[problem()!]) }}</p> }
        <div class="actions">
          @if (canIssue()) { <button type="button" class="btn btn--primary" (click)="issue()"><i class="fa-solid fa-file-circle-check" aria-hidden="true"></i>{{ t('rx.issue') }}</button> }
          <button type="button" class="btn" (click)="saveDraft()">{{ t('rx.saveDraft') }}</button>
          <button type="button" class="btn" (click)="showPreview.set(!showPreview())"><i class="fa-regular fa-eye" aria-hidden="true"></i>{{ t('rx.preview') }}</button>
          <button type="button" class="btn" (click)="askTemplate.set(!askTemplate())">{{ t('rx.saveTemplate') }}</button>
          <button type="button" class="btn" (click)="discard()">{{ t('rx.discard') }}</button>
        </div>
        @if (askTemplate()) {
          <form class="inline" (submit)="$event.preventDefault(); saveAsTemplate()">
            <input class="input" [value]="templateName()" maxlength="80" [placeholder]="t('rx.templateName')" [attr.aria-label]="t('rx.templateName')" (input)="templateName.set($any($event.target).value)" />
            <button class="btn btn--primary" type="submit">{{ t('rx.tpl.save') }}</button>
          </form>
        }
        @if (savedTemplate()) { <p class="hint" role="status">{{ t('rx.templateSaved') }}</p> }
        @if (showPreview()) { <iframe class="paper" [srcdoc]="srcdoc(d)" [title]="t('rx.preview')"></iframe> }
      </div>
    } @else if (viewing(); as v) {
      <div class="editor">
        <div class="bar"><button type="button" class="btn" (click)="viewing.set(null)"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i>{{ t('rx.back') }}</button>
          <button type="button" class="btn btn--primary" (click)="print(v)"><i class="fa-solid fa-print" aria-hidden="true"></i>{{ t('rx.print') }}</button></div>
        <p class="hint">{{ t('rx.pdfHint') }}</p>
        <iframe class="paper" [srcdoc]="srcdoc(v)" [title]="t('rx.preview')"></iframe>
      </div>
    } @else {
      <div class="start">
        <div class="from">
          <label class="field"><span class="label">{{ t('rx.pickTemplate') }}</span>
            <select class="input" [disabled]="!lib.templates().length" (change)="chosen.set($any($event.target).value)">
              <option value="">—</option>
              @for (x of lib.templates(); track x.id) { <option [value]="x.id" [selected]="chosen() === x.id">{{ x.name }}</option> }
            </select></label>
          <button type="button" class="btn" [disabled]="!chosen()" (click)="startFromTemplate()"><i class="fa-solid fa-file-prescription" aria-hidden="true"></i>{{ t('rx.from.template') }}</button>
        </div>
        <button type="button" class="btn btn--primary" (click)="startBlank()"><i class="fa-solid fa-plus" aria-hidden="true"></i>{{ t('rx.from.scratch') }}</button>
      </div>
      @if (!lib.templates().length) { <p class="hint">{{ t('rx.noTemplates') }}</p> }
      <h3 class="sub">{{ t('rx.history') }}</h3>
      @if (!rows().length) { <p class="hint">{{ t('rx.empty') }}</p> }
      <ul class="rows">
        @for (r of rows(); track r.id) {
          <li>
            <div class="grow">
              <div><strong>{{ r.number ?? '—' }}</strong> · {{ day(r.issuedAt ?? r.createdAt) }} · {{ dentistName(r.dentistId) }}
                <span class="chip" [attr.data-tone]="r.status === 'issued' ? 'ok' : r.status === 'draft' ? 'neutral' : 'warn'">{{ t(statusKey[r.status]) }}</span></div>
              <div class="hint">{{ summary(r) }}</div>
              @if (r.correctsId) { <div class="hint">{{ t('rx.corrects', { n: numberOf(r.correctsId) }) }}@if (r.correctionReason) { — {{ r.correctionReason }} }</div> }
              @if (r.supersededById) { <div class="hint">{{ t('rx.supersededBy', { n: numberOf(r.supersededById) }) }}</div> }
              @if (r.voidReason) { <div class="hint">{{ t('rx.voidedWhy', { reason: r.voidReason }) }}</div> }
              @if (r.appointmentId) { <div class="hint">{{ t('rx.appointment', { date: visitDay(r.appointmentId) }) }}</div> }
            </div>
            @if (r.status === 'draft') { <button type="button" class="btn" (click)="draft.set(r)">{{ t('rx.edit') }}</button> }
            @else { <button type="button" class="btn" (click)="viewing.set(r)">{{ t('rx.open') }}</button> }
            @if (r.status === 'issued') {
              @if (canIssue()) { <button type="button" class="btn" (click)="act.set({ id: r.id, kind: 'correct' }); reason.set('')">{{ t('rx.correct') }}</button> }
              @if (auth.can('clinical.void')) { <button type="button" class="btn" (click)="act.set({ id: r.id, kind: 'void' }); reason.set('')">{{ t('rx.void') }}</button> }
            }
          </li>
          @if (act(); as a) {
            @if (a.id === r.id) {
              <li class="inline">
                <input class="input" [value]="reason()" maxlength="200" [placeholder]="t(a.kind === 'void' ? 'rx.void.reason' : 'rx.correct.reason')" [attr.aria-label]="t(a.kind === 'void' ? 'rx.void.reason' : 'rx.correct.reason')" (input)="reason.set($any($event.target).value)" />
                <button type="button" class="btn btn--primary" [disabled]="!reason().trim()" (click)="confirmAct(r)">{{ t(a.kind === 'void' ? 'rx.void.go' : 'rx.correct.go') }}</button>
                <button type="button" class="btn" (click)="act.set(null)">{{ t('common.cancel') }}</button>
              </li>
            }
          }
        }
      </ul>
    }
  `,
  styles: `
    :host { display: block; padding: 16px; }
    .start { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-end; justify-content: space-between; } .from { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; }
    .field { display: flex; flex-direction: column; gap: 3px; } .label { font-size: 12px; color: var(--app-muted); font-weight: 600; } .hint { color: var(--app-muted); font-size: 13px; margin: 4px 0; }
    .sub { margin: 20px 0 4px; font-size: 14px; } .rows { list-style: none; margin: 0; padding: 0; } .rows li { display: flex; gap: 8px; align-items: center; padding: 10px 0; border-top: 1px solid var(--app-line); } .grow { flex: 1; }
    .editor { display: grid; gap: 14px; } .bar, .actions, .inline, .meta { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end; } .meta .field { min-width: 220px; }
    .inline .input { flex: 1 1 260px; }
    .warn { display: grid; gap: 6px; } .note { display: flex; flex-wrap: wrap; gap: 6px 10px; padding: 8px 10px; border: 1px solid var(--app-line); border-radius: 8px; font-size: 13px; }
    .note[data-level='critical'] { border: 2px solid currentColor; font-weight: 600; } .note[data-level='warning'] { border-style: dashed; } .note[data-level='info'] { color: var(--app-muted); }
    .check { display: flex; gap: 6px; align-items: center; }
    .error { color: var(--app-danger); font-size: 13px; margin: 0; } .paper { width: 100%; height: 1000px; border: 1px solid var(--app-line); background: #fff; border-radius: 6px; }
  `,
})
export class RxPageComponent {
  readonly patient = input.required<Patient>();
  protected readonly store = inject(DentalStore);
  protected readonly auth = inject(AuthService);
  /** Only prescribers (the clinical “approve” right) issue or correct prescriptions; others may prepare drafts. */
  protected readonly canIssue = computed(() => this.auth.can('clinical.approve'));
  protected readonly lib = inject(RxLibrary);
  private readonly docs = inject(Documents);
  private readonly i18n = inject(I18n);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly t = this.i18n.t;

  protected readonly levelKey: Record<string, Key> = { critical: 'rx.w.critical', warning: 'rx.w.warning', info: 'rx.w.info' };
  protected readonly problemKey: Record<IssueProblem | 'dentist', Key> = { empty: 'rx.err.empty', unnamed: 'rx.err.unnamed', unreviewed: 'rx.err.unreviewed', dentist: 'rx.noDentist' };
  protected readonly statusKey: Record<Prescription['status'], Key> = { draft: 'rx.status.draft', issued: 'rx.status.issued', voided: 'rx.status.voided', superseded: 'rx.status.superseded' };

  protected readonly draft = signal<Prescription | null>(null);
  protected readonly viewing = signal<Prescription | null>(null);
  protected readonly chosen = signal('');
  protected readonly showPreview = signal(false);
  protected readonly askTemplate = signal(false);
  protected readonly templateName = signal('');
  protected readonly savedTemplate = signal(false);
  protected readonly tried = signal(false);
  protected readonly act = signal<{ id: string; kind: 'correct' | 'void' } | null>(null);
  protected readonly reason = signal('');
  /** Unticked by default: a prescription does not prove the patient is taking the drug. */
  protected readonly record = signal(false);
  protected readonly canRecord = computed(() => !!this.draft()?.items.some((i) => i.medicationId) && this.store.patients().length > 0);

  protected readonly all = computed(() => this.patient().prescriptions ?? []);
  protected readonly rows = computed(() => [...this.all()].sort((a, b) => (b.issuedAt ?? b.createdAt).localeCompare(a.issuedAt ?? a.createdAt)));
  protected readonly visits = computed(() => this.store.appointments().filter((a) => a.patientId === this.patient().id).sort((a, b) => b.start.getTime() - a.start.getTime()).slice(0, 20));
  protected readonly warnings = computed(() => { const p = this.patient(); return rxWarnings({ medical: p.medical, alert: p.alert, allergies: activeAllergies(p), medications: activeMedications(p), allergyDefs: this.lib.allergies(), meds: this.lib.medications() }, this.draft()?.items ?? [], (c) => this.t(`med.${c}` as Key)); });
  protected readonly problem = computed((): IssueProblem | 'dentist' | null => {
    const d = this.draft();
    if (!d) return null;
    return issueProblem(d.items, this.warnings(), d.acknowledged ?? []) ?? (d.dentistId ? null : 'dentist');
  });

  protected day(iso: string): string { return this.i18n.date(new Date(iso), { day: 'numeric', month: 'short', year: 'numeric' }); }
  protected visitDay(id: string): string { const a = this.store.appointments().find((x) => x.id === id); return a ? this.day(a.start.toISOString()) : ''; }
  protected dentistName(id?: string): string { return this.store.dentists().find((d) => d.id === id)?.name ?? '—'; }
  protected numberOf(id: string): string { return this.all().find((p) => p.id === id)?.number ?? '—'; }
  protected summary(r: Prescription): string { return r.items.map(itemTitle).filter(Boolean).join(', ') || '—'; }

  private blank(items: RxItem[], templateId?: string): Prescription {
    const now = new Date().toISOString();
    return { id: crypto.randomUUID(), status: 'draft', createdAt: now, updatedAt: now, dentistId: this.store.dentists().length === 1 ? this.store.dentists()[0].id : undefined, templateId, items };
  }
  private open(d: Prescription): void { this.tried.set(false); this.showPreview.set(false); this.askTemplate.set(false); this.savedTemplate.set(false); this.draft.set(d); }
  protected startBlank(): void { this.open(this.blank([])); }
  protected startFromTemplate(): void {
    const t = this.lib.templates().find((x) => x.id === this.chosen());
    if (t) this.open(this.blank(itemsFromTemplate(t, () => crypto.randomUUID()), t.id));
  }

  protected patch(p: Partial<Prescription>): void { this.draft.update((d) => (d ? { ...d, ...p } : d)); }
  protected ack(id: string): void { this.draft.update((d) => { if (!d) return d; const a = d.acknowledged ?? []; return { ...d, acknowledged: a.includes(id) ? a.filter((x) => x !== id) : [...a, id] }; }); }
  protected close(): void { this.draft.set(null); }

  private upsert(list: Prescription[], d: Prescription): Prescription[] {
    const next = { ...d, updatedAt: new Date().toISOString() };
    return list.some((p) => p.id === d.id) ? list.map((p) => (p.id === d.id ? next : p)) : [...list, next];
  }
  protected saveDraft(): void { const d = this.draft(); if (d) { this.store.changePrescriptions(this.patient().id, (l) => this.upsert(l, d)); this.draft.set(null); } }
  protected discard(): void { const d = this.draft(); if (d) this.store.changePrescriptions(this.patient().id, (l) => l.filter((p) => !(p.id === d.id && p.status === 'draft'))); this.draft.set(null); }

  private snapshot(d: Prescription): RxSnapshot {
    const dentist = this.store.dentists().find((x) => x.id === d.dentistId)!;
    const loc = this.store.locations().find((l) => l.id === dentist.locationId) ?? this.store.locations()[0];
    const p = this.patient();
    return {
      clinic: { name: loc?.legalName || loc?.name || 'Dontalist', address: loc?.address, phone: loc?.phone, email: loc?.email, logo: loc?.logo },
      dentist: { name: dentist.name, specialty: dentist.specialty, registration: dentist.registration, phone: dentist.phone, email: dentist.email },
      patient: { name: p.fullName, birthDate: p.birthDate, sex: p.sex, phone: p.phone },
    };
  }

  protected issue(): void {
    if (!this.canIssue()) return;
    const d = this.draft();
    this.tried.set(true);
    if (!d || this.problem()) return;
    const now = new Date().toISOString();
    const number = nextRxNumber(this.store.patients().flatMap((p) => p.prescriptions ?? []), new Date().getFullYear());
    const snap = this.snapshot(d);
    this.store.changePrescriptions(this.patient().id, (l) => applyIssue(this.upsert(l, d), d.id, number, snap, d.acknowledged ?? [], now));
    if (this.record()) this.recordMedications(d, number, now);
    this.record.set(false);
    this.draft.set(null);
  }

  /** Adds the issued drugs as current medications, skipping any the patient already has active. */
  private recordMedications(d: Prescription, number: string, now: string): void {
    const meds = this.lib.medications();
    this.store.changeMedical(this.patient().id, (r) => {
      const have = new Set(r.medications.filter((m) => m.active && !m.removedAt).map((m) => m.medicationId));
      const add = d.items.filter((i) => i.medicationId && !have.has(i.medicationId)).map((i) => ({
        id: crypto.randomUUID(), medicationId: i.medicationId!, label: meds.find((m) => m.id === i.medicationId)?.name ?? i.name,
        start: now.slice(0, 10), active: true, source: 'prescribed' as const, prescriptionId: d.id, createdAt: now, history: [audit('prescribed', now, number)],
      }));
      return { ...r, medications: [...r.medications, ...add] };
    });
  }

  protected confirmAct(r: Prescription): void {
    const a = this.act();
    const why = this.reason().trim();
    if (!a || !why) return;
    const now = new Date().toISOString();
    if (a.kind === 'void') this.store.changePrescriptions(this.patient().id, (l) => voidPrescription(l, r.id, why, now));
    else { const c = startCorrection(r, crypto.randomUUID(), why, now, () => crypto.randomUUID()); this.store.changePrescriptions(this.patient().id, (l) => [...l, c]); this.open(c); }
    this.act.set(null);
  }

  protected async saveAsTemplate(): Promise<void> {
    const d = this.draft(), name = this.templateName().trim();
    if (!d || !name || !d.items.length) return;
    const tpl: RxTemplate = { id: crypto.randomUUID(), name, items: d.items.map((i) => ({ ...tidyItem(i), id: crypto.randomUUID() })), updatedAt: new Date().toISOString() };
    await this.lib.saveTemplate(tpl);
    this.templateName.set(''); this.askTemplate.set(false); this.savedTemplate.set(true);
  }

  private labels(): RxDocLabels {
    const t = this.t;
    return { patient: t('rx.doc.patient'), date: t('rx.doc.date'), registration: t('rx.doc.registration'), signature: t('rx.doc.signature'), stamp: t('rx.doc.stamp'), number: t('rx.doc.number'), voided: t('rx.doc.void'), draft: t('rx.doc.draft'), birth: t('rx.doc.birth'),
      f: { dosage: t('rx.f.dosage'), route: t('rx.f.route'), frequency: t('rx.f.frequency'), duration: t('rx.f.duration'), quantity: t('rx.f.quantity'), refills: t('rx.f.refills') },
      corrects: '', reason: '' };
  }
  private docInput(r: Prescription, preview: boolean) {
    const snapshot = r.snapshot ?? (r.dentistId ? this.snapshot(r) : { clinic: { name: this.store.locations()[0]?.name ?? 'Dontalist' }, dentist: { name: '' }, patient: { name: this.patient().fullName } });
    const corrects = r.correctsId ? this.t('rx.corrects', { n: this.numberOf(r.correctsId) }) : undefined;
    const birth = snapshot.patient.birthDate ? this.t('rx.doc.birth', { date: snapshot.patient.birthDate }) : undefined;
    return { rx: r, snapshot, date: this.day(r.issuedAt ?? r.createdAt), birth, corrects, labels: { ...this.labels(), corrects: corrects ?? '', reason: r.correctionReason ? this.t('rx.reason', { reason: r.correctionReason }) : '' }, lang: this.i18n.lang(), preview };
  }
  protected srcdoc(r: Prescription) { return this.sanitizer.bypassSecurityTrustHtml(rxHtml(this.docInput(r, true))) as unknown as string; }
  protected print(r: Prescription): void { this.docs.print(rxHtml(this.docInput(r, false))); }
}
