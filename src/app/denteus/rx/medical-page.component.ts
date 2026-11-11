import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { I18n, Key } from '../../core/i18n/i18n.service';
import { AuditEntry, Patient, PatientAllergy, PatientMedication } from '../models/dental.models';
import { DentalStore } from '../services/dental-store.service';
import { audit, displayName, liveAllergies, liveMedications, norm } from './med-library';
import { RxLibrary } from './rx-library.service';
import { unmatchedPieces } from './rx-rules';

type AForm = { id?: string; allergyId?: string; label?: string; reaction: string; date: string; legacy?: string };
type MForm = { id?: string; medicationId?: string; label?: string; notes: string; start: string; stop: string; source: PatientMedication['source']; legacy?: string };
const HIST: Record<string, Key> = { added: 'pm.h.added', edited: 'pm.h.edited', activated: 'pm.h.activated', deactivated: 'pm.h.deactivated', stopped: 'pm.h.stopped', resumed: 'pm.h.resumed', removed: 'pm.h.removed', merged: 'pm.h.merged', prescribed: 'pm.h.prescribed', confirmed: 'pm.h.confirmed' };

/** The patient's allergies and medications as records that point into the clinic libraries, with the old free-text notes kept until confirmed. */
@Component({
  selector: 'den-medical-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="block" aria-labelledby="pm-a">
      <header class="head"><h3 id="pm-a">{{ t('pm.allergies') }}</h3>
        <label class="check"><input type="checkbox" [checked]="showInactive()" (change)="showInactive.set($any($event.target).checked)" />{{ t('pm.showInactive') }}</label>
        @if (canEdit()) { <button type="button" class="btn" (click)="openA()"><i class="fa-solid fa-plus" aria-hidden="true"></i>{{ t('pm.addAllergy') }}</button> }</header>
      @if (aForm(); as f) {
        <form class="form" novalidate (submit)="$event.preventDefault(); saveA()">
          @if (!f.id) {
            <div class="field wide"><span class="label">{{ t('pm.search.allergy') }}</span>
              <input class="input" type="search" [value]="query()" maxlength="80" [attr.aria-label]="t('pm.search.allergy')" (input)="query.set($any($event.target).value)" />
              @if (f.allergyId) { <span class="chip" data-tone="info">{{ f.label }}</span> }
              @if (query().trim() && !f.allergyId) {
                <ul class="results">
                  @for (d of allergyMatches(); track d.id) { <li><button type="button" class="pick" (click)="pickA(d.id, d.name)">{{ d.name }}</button></li> }
                  @if (lib.canEdit && !exactAllergy()) { <li><button type="button" class="pick typed" (click)="newAllergy()">{{ t('pm.newAllergy', { name: query().trim() }) }}</button></li> }
                </ul>
              }
            </div>
          } @else { <p class="wide"><strong>{{ f.label }}</strong></p> }
          <label class="field"><span class="label">{{ t('pm.reaction') }}</span><input class="input" [value]="f.reaction" maxlength="200" (input)="patchA({ reaction: $any($event.target).value })" /></label>
          <label class="field"><span class="label">{{ t('pm.reactionDate') }}</span><input class="input" type="date" [value]="f.date" (input)="patchA({ date: $any($event.target).value })" /></label>
          @if (error()) { <p class="error wide" role="alert">{{ t('pm.err.pick') }}</p> }
          <div class="wide row"><button class="btn btn--primary" type="submit">{{ t('pm.save') }}</button><button class="btn" type="button" (click)="aForm.set(null)">{{ t('lib.cancel') }}</button></div>
        </form>
      }
      <ul class="list">
        @for (a of allergies(); track a.id) {
          <li [class.dim]="!a.active">
            <div class="grow"><strong>{{ allergyName(a) }}</strong> <span class="chip" [attr.data-tone]="a.active ? 'danger' : 'neutral'">{{ t(a.active ? 'pm.active' : 'pm.inactive') }}</span>
              @if (a.reaction) { <div class="muted">{{ t('pm.reaction') }}: {{ a.reaction }}@if (a.reactionDate) { · {{ a.reactionDate }} }</div> }
              <details><summary>{{ t('pm.history') }}</summary>@for (h of a.history; track $index) { <div class="muted">{{ h.at.slice(0, 10) }} · {{ histText(h) }}</div> }</details></div>
            @if (canEdit()) {
              <button type="button" class="btn" (click)="editA(a)">{{ t('lib.edit') }}</button>
              <button type="button" class="btn" (click)="toggleA(a)">{{ t(a.active ? 'pm.deactivate' : 'pm.activate') }}</button>
              <button type="button" class="btn" (click)="removeA(a)">{{ t('pm.remove') }}</button>
            }
          </li>
        }
        @if (!allergies().length) { <li class="muted">{{ t('pm.none.allergies') }}</li> }
      </ul>
    </section>

    <section class="block" aria-labelledby="pm-m">
      <header class="head"><h3 id="pm-m">{{ t('pm.medications') }}</h3>
        <label class="check"><input type="checkbox" [checked]="showStopped()" (change)="showStopped.set($any($event.target).checked)" />{{ t('pm.showStopped') }}</label>
        @if (canEdit()) { <button type="button" class="btn" (click)="openM()"><i class="fa-solid fa-plus" aria-hidden="true"></i>{{ t('pm.addMedication') }}</button> }</header>
      @if (mForm(); as f) {
        <form class="form" novalidate (submit)="$event.preventDefault(); saveM()">
          @if (!f.id) {
            <div class="field wide"><span class="label">{{ t('pm.search.med') }}</span>
              <input class="input" type="search" [value]="query()" maxlength="80" [attr.aria-label]="t('pm.search.med')" (input)="query.set($any($event.target).value)" />
              @if (f.medicationId) { <span class="chip" data-tone="info">{{ f.label }}</span> }
              @if (query().trim() && !f.medicationId) {
                <ul class="results">
                  @for (m of medMatches(); track m.id) { <li><button type="button" class="pick" (click)="pickM(m.id, m.label)">{{ m.label }}</button></li> }
                  @if (lib.canEdit && !exactMed()) { <li><button type="button" class="pick typed" (click)="newMed()">{{ t('pm.newMed', { name: query().trim() }) }}</button></li> }
                </ul>
              }
            </div>
          } @else { <p class="wide"><strong>{{ f.label }}</strong></p> }
          <label class="field wide"><span class="label">{{ t('pm.notes') }}</span><input class="input" [value]="f.notes" maxlength="300" (input)="patchM({ notes: $any($event.target).value })" /></label>
          <label class="field"><span class="label">{{ t('pm.start') }}</span><input class="input" type="date" [value]="f.start" (input)="patchM({ start: $any($event.target).value })" /></label>
          <label class="field"><span class="label">{{ t('pm.stop') }}</span><input class="input" type="date" [value]="f.stop" (input)="patchM({ stop: $any($event.target).value })" /></label>
          <label class="field"><span class="label">{{ t('pm.source') }}</span>
            <select class="input" (change)="patchM({ source: $any($event.target).value })">
              @for (s of sources; track s) { <option [value]="s" [selected]="f.source === s">{{ t(srcKey[s]) }}</option> }
            </select></label>
          @if (error()) { <p class="error wide" role="alert">{{ t('pm.err.pick') }}</p> }
          <div class="wide row"><button class="btn btn--primary" type="submit">{{ t('pm.save') }}</button><button class="btn" type="button" (click)="mForm.set(null)">{{ t('lib.cancel') }}</button></div>
        </form>
      }
      <ul class="list">
        @for (m of medications(); track m.id) {
          <li [class.dim]="!m.active">
            <div class="grow"><strong>{{ medName(m) }}</strong> <span class="chip" [attr.data-tone]="m.active ? 'info' : 'neutral'">{{ t(m.active ? 'pm.active' : 'pm.discontinued') }}</span>
              @if (m.notes) { <div>{{ m.notes }}</div> }
              <div class="muted">@if (m.start) { {{ t('pm.start') }} {{ m.start }} } @if (m.stop) { · {{ t('pm.stop') }} {{ m.stop }} } @if (m.source) { · {{ t(srcKey[m.source]) }} }</div>
              <details><summary>{{ t('pm.history') }}</summary>@for (h of m.history; track $index) { <div class="muted">{{ h.at.slice(0, 10) }} · {{ histText(h) }}</div> }</details></div>
            @if (canEdit()) {
              <button type="button" class="btn" (click)="editM(m)">{{ t('lib.edit') }}</button>
              <button type="button" class="btn" (click)="toggleM(m)">{{ t(m.active ? 'pm.stopNow' : 'pm.resume') }}</button>
              <button type="button" class="btn" (click)="removeM(m)">{{ t('pm.remove') }}</button>
            }
          </li>
        }
        @if (!medications().length) { <li class="muted">{{ t('pm.none.meds') }}</li> }
      </ul>
    </section>

    @if (legacyA().length || legacyM().length) {
      <section class="block legacy" aria-labelledby="pm-l">
        <h3 id="pm-l">{{ t('pm.legacy.title') }}</h3>
        <p class="muted">{{ t('pm.legacy.hint') }}</p>
        @if (legacyA().length) { <p><strong>{{ t('pm.legacy.allergies') }}:</strong></p>
          <ul class="list">@for (x of legacyA(); track x) { <li><span class="grow">{{ x }}</span>@if (canEdit()) { <button type="button" class="btn" (click)="confirmA(x)">{{ t('pm.legacy.match') }}</button> }</li> }</ul> }
        @if (legacyM().length) { <p><strong>{{ t('pm.legacy.medications') }}:</strong></p>
          <ul class="list">@for (x of legacyM(); track x) { <li><span class="grow">{{ x }}</span>@if (canEdit()) { <button type="button" class="btn" (click)="confirmM(x)">{{ t('pm.legacy.match') }}</button> }</li> }</ul> }
      </section>
    }
  `,
  styles: `
    :host { display: grid; gap: 20px; padding: 16px; } .block { display: grid; gap: 8px; } .head { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; } .head h3, .legacy h3 { margin: 0; font-size: 15px; flex: 1; }
    .check { display: flex; gap: 6px; align-items: center; font-size: 13px; } .row { display: flex; gap: 8px; } .muted { color: var(--app-muted); font-size: 13px; }
    .form { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; padding: 12px; border: 1px solid var(--app-line); border-radius: 8px; } .wide { grid-column: 1 / -1; }
    .field { display: flex; flex-direction: column; gap: 3px; } .label { font-size: 12px; color: var(--app-muted); font-weight: 600; } .error { color: var(--app-danger); font-size: 13px; margin: 0; }
    .list { list-style: none; margin: 0; padding: 0; } .list li { display: flex; gap: 8px; align-items: flex-start; padding: 10px 0; border-top: 1px solid var(--app-line); } .grow { flex: 1; } .dim { opacity: .65; }
    .results { list-style: none; margin: 4px 0 0; padding: 4px; border: 1px solid var(--app-line); border-radius: 8px; max-height: 220px; overflow: auto; }
    .pick { all: unset; display: block; width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 6px; cursor: pointer; } .pick:hover, .pick:focus-visible { background: var(--app-hover, rgba(127,127,127,.12)); outline: none; } .typed { font-style: italic; }
    .legacy { padding: 12px; border: 1px dashed var(--app-line); border-radius: 8px; } summary { cursor: pointer; font-size: 13px; color: var(--app-muted); }
  `,
})
export class MedicalPageComponent {
  readonly patient = input.required<Patient>();
  protected readonly lib = inject(RxLibrary);
  private readonly store = inject(DentalStore);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly sources = ['manual', 'reported', 'prescribed'] as const;
  protected readonly srcKey = { manual: 'pm.source.manual', reported: 'pm.source.reported', prescribed: 'pm.source.prescribed' } as const satisfies Record<NonNullable<PatientMedication['source']>, Key>;
  protected readonly showInactive = signal(false);
  protected readonly showStopped = signal(false);
  protected readonly query = signal('');
  protected readonly error = signal(false);
  protected readonly aForm = signal<AForm | null>(null);
  protected readonly mForm = signal<MForm | null>(null);

  protected readonly canEdit = computed(() => this.lib.canEdit);
  protected readonly allergies = computed(() => liveAllergies(this.patient()).filter((a) => this.showInactive() || a.active));
  protected readonly medications = computed(() => liveMedications(this.patient()).filter((m) => this.showStopped() || m.active));
  protected readonly legacyA = computed(() => unmatchedPieces(this.patient().medical?.allergies, this.patient().medical?.legacyMatched));
  protected readonly legacyM = computed(() => unmatchedPieces(this.patient().medical?.medications, this.patient().medical?.legacyMatched));
  protected readonly allergyMatches = computed(() => { const q = norm(this.query()); return q ? this.lib.allergies().filter((d) => !d.hidden && norm(d.name).includes(q)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 8) : []; });
  protected readonly exactAllergy = computed(() => this.lib.allergies().some((d) => norm(d.name) === norm(this.query())));
  protected readonly medMatches = computed(() => { const q = norm(this.query()); const all = this.lib.medications(); return q ? all.filter((m) => !m.hidden && norm(displayName(all, m)).includes(q)).map((m) => ({ id: m.id, label: displayName(all, m) })).sort((a, b) => a.label.localeCompare(b.label)).slice(0, 8) : []; });
  protected readonly exactMed = computed(() => this.lib.medications().some((m) => m.kind === 'generic' && norm(m.name) === norm(this.query())));

  protected allergyName(a: PatientAllergy): string { return this.lib.allergies().find((d) => d.id === a.allergyId)?.name ?? a.label; }
  protected medName(m: PatientMedication): string { const all = this.lib.medications(); const x = all.find((y) => y.id === m.medicationId); return x ? displayName(all, x) : m.label; }
  protected histText(h: AuditEntry): string { return this.t(HIST[h.what] ?? 'pm.h.edited', { note: h.note ?? '' }); }
  private now(): string { return new Date().toISOString(); }
  private today(): string { return this.now().slice(0, 10); }
  private id(): string { return crypto.randomUUID(); }
  private matchedWith(piece: string | undefined) { return piece ? [...(this.patient().medical?.legacyMatched ?? []), piece.toLowerCase()] : undefined; }

  /* allergies */
  protected openA(piece?: string): void { this.error.set(false); this.query.set(piece ?? ''); this.aForm.set({ reaction: '', date: '', legacy: piece }); }
  protected confirmA(piece: string): void { this.mForm.set(null); this.openA(piece); }
  protected editA(a: PatientAllergy): void { this.error.set(false); this.mForm.set(null); this.aForm.set({ id: a.id, allergyId: a.allergyId, label: this.allergyName(a), reaction: a.reaction ?? '', date: a.reactionDate ?? '' }); }
  protected patchA(p: Partial<AForm>): void { this.aForm.update((f) => (f ? { ...f, ...p } : f)); }
  protected pickA(id: string, name: string): void { this.patchA({ allergyId: id, label: name }); }
  protected async newAllergy(): Promise<void> {
    const name = this.query().trim();
    const def = { id: this.id(), name };
    if (!(await this.lib.saveAllergy(def))) this.pickA(def.id, name);
  }
  protected saveA(): void {
    const f = this.aForm();
    if (!f) return;
    if (!f.allergyId) { this.error.set(true); return; }
    const now = this.now();
    const reaction = f.reaction.trim() || undefined, reactionDate = f.date || undefined;
    this.store.changeMedical(this.patient().id, (r) => f.id
      ? { ...r, allergies: r.allergies.map((a) => (a.id === f.id ? { ...a, reaction, reactionDate, history: [...a.history, audit('edited', now)] } : a)) }
      : { ...r, allergies: [...r.allergies, { id: this.id(), allergyId: f.allergyId!, label: f.label!, reaction, reactionDate, active: true, createdAt: now, legacyText: f.legacy, history: [audit(f.legacy ? 'confirmed' : 'added', now, f.legacy)] }], legacyMatched: this.matchedWith(f.legacy) ?? r.legacyMatched });
    this.aForm.set(null);
  }
  protected toggleA(a: PatientAllergy): void { const now = this.now(); this.store.changeMedical(this.patient().id, (r) => ({ ...r, allergies: r.allergies.map((x) => (x.id === a.id ? { ...x, active: !x.active, history: [...x.history, audit(x.active ? 'deactivated' : 'activated', now)] } : x)) })); }
  protected removeA(a: PatientAllergy): void { if (confirm(this.t('pm.confirmRemove', { name: this.allergyName(a) }))) { const now = this.now(); this.store.changeMedical(this.patient().id, (r) => ({ ...r, allergies: r.allergies.map((x) => (x.id === a.id ? { ...x, removedAt: now, history: [...x.history, audit('removed', now)] } : x)) })); } }

  /* medications */
  protected openM(piece?: string): void { this.error.set(false); this.query.set(piece ?? ''); this.mForm.set({ notes: '', start: '', stop: '', source: 'manual', legacy: piece }); }
  protected confirmM(piece: string): void { this.aForm.set(null); this.openM(piece); }
  protected editM(m: PatientMedication): void { this.error.set(false); this.aForm.set(null); this.mForm.set({ id: m.id, medicationId: m.medicationId, label: this.medName(m), notes: m.notes ?? '', start: m.start ?? '', stop: m.stop ?? '', source: m.source ?? 'manual' }); }
  protected patchM(p: Partial<MForm>): void { this.mForm.update((f) => (f ? { ...f, ...p } : f)); }
  protected pickM(id: string, label: string): void { this.patchM({ medicationId: id, label }); }
  protected async newMed(): Promise<void> {
    const name = this.query().trim();
    const m = { id: this.id(), kind: 'generic' as const, name };
    if (!(await this.lib.saveMedication(m))) this.pickM(m.id, name);
  }
  protected saveM(): void {
    const f = this.mForm();
    if (!f) return;
    if (!f.medicationId) { this.error.set(true); return; }
    const now = this.now();
    const notes = f.notes.trim() || undefined, start = f.start || undefined, stop = f.stop || undefined;
    this.store.changeMedical(this.patient().id, (r) => f.id
      ? { ...r, medications: r.medications.map((m) => (m.id === f.id ? { ...m, notes, start, stop, source: f.source, history: [...m.history, audit('edited', now)] } : m)) }
      : { ...r, medications: [...r.medications, { id: this.id(), medicationId: f.medicationId!, label: f.label!, notes, start, stop, source: f.source, active: !stop, createdAt: now, legacyText: f.legacy, history: [audit(f.legacy ? 'confirmed' : 'added', now, f.legacy)] }], legacyMatched: this.matchedWith(f.legacy) ?? r.legacyMatched });
    this.mForm.set(null);
  }
  protected toggleM(m: PatientMedication): void {
    const now = this.now(), today = this.today();
    this.store.changeMedical(this.patient().id, (r) => ({ ...r, medications: r.medications.map((x) => (x.id === m.id ? { ...x, active: !x.active, stop: x.active ? x.stop ?? today : undefined, history: [...x.history, audit(x.active ? 'stopped' : 'resumed', now)] } : x)) }));
  }
  protected removeM(m: PatientMedication): void { if (confirm(this.t('pm.confirmRemove', { name: this.medName(m) }))) { const now = this.now(); this.store.changeMedical(this.patient().id, (r) => ({ ...r, medications: r.medications.map((x) => (x.id === m.id ? { ...x, removedAt: now, history: [...x.history, audit('removed', now)] } : x)) })); } }
}
