import { Documents } from '../documents/documents.service';
import { inCurrency, planInCurrency } from '../regional/regional-rules';
import { refundedTotal } from './invoice-rules';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { I18n, Key } from '../../core/i18n/i18n.service';
import { Appointment, Patient } from '../models/dental.models';
import { apiMessage } from '../../core/api/api.interceptor';
import { PatientApi } from '../../core/api/patient-api.service';
import { DentalStore } from '../services/dental-store.service';
import { STATUS_KEY, STATUS_TONE, isActive, localIsoDay, relativeDay, typeKey } from '../utils/appointment-labels';
import { ageOn, hasAlert, initials, mapUrlOk, parseIsoDate } from './patient-rules';
import { balance, procedureName } from './treatment-rules';
import { messageLink, whatsappNumber } from './reminder-rules';
import { DentalChartComponent } from '../odontogram/dental-chart.component';
import { BillingComponent } from './billing.component';
import { DocumentsComponent } from './documents.component';
import { RxPageComponent } from '../rx/rx-page.component';
import { PatientInsuranceComponent } from './patient-insurance.component';
import { MedicalPageComponent } from '../rx/medical-page.component';
import { activeAllergies, activeMedications } from '../rx/med-library';
import { RxLibrary } from '../rx/rx-library.service';
import { unmatchedPieces } from '../rx/rx-rules';
import { LettersComponent } from './letters.component';
import { VisitNotesComponent } from './visit-notes.component';
import { TreatmentPlanComponent } from './treatment-plan.component';
import { QuoteVersionsComponent } from './quote-versions.component';
import { PROFILE_PAGES, Section } from './profile-pages';

type Tab = 'upcoming' | 'history';

@Component({
  selector: 'den-patient-profile',
  imports: [RouterLink, QuoteVersionsComponent, DentalChartComponent, TreatmentPlanComponent, BillingComponent, VisitNotesComponent, LettersComponent, DocumentsComponent, RxPageComponent, MedicalPageComponent, PatientInsuranceComponent],
  templateUrl: './patient-profile.component.html',
  styleUrl: './patient-profile.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ds-page' },
})
export class PatientProfileComponent {
  protected readonly docs = inject(Documents);
  /** Bound from the route (`/patients/:id`). */
  readonly id = input.required<string>();
  /** Appointment to write a visit note for (`/patients/:id?note=<appointment id>`, from the calendar). */
  readonly note = input<string>();
  /** Which page of the file is open (`/patients/:id/:page`). Unknown or forbidden pages fall back to the overview. */
  readonly page = input<string>();

  protected readonly store = inject(DentalStore);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly mapUrlOk = mapUrlOk;
  protected readonly hasAlert = hasAlert;
  protected readonly activeAllergies = activeAllergies;
  protected readonly activeMedications = activeMedications;
  protected readonly allergyName = (a: { allergyId: string; label: string }) => this.lib.allergies().find((d) => d.id === a.allergyId)?.name ?? a.label;
  protected readonly unconfirmed = (text: string | undefined, p: { medical?: { legacyMatched?: string[] } }) => unmatchedPieces(text, p.medical?.legacyMatched);
  private readonly lib = inject(RxLibrary);
  protected readonly STATUS_KEY = STATUS_KEY;
  protected readonly STATUS_TONE = STATUS_TONE;
  protected readonly typeKey = typeKey;
  protected readonly initials = initials;

  protected readonly tab = signal<Tab>('upcoming');
  protected readonly auth = inject(AuthService);
  /** Dentists don't see billing, reception doesn't see clinical records, and the clinic can hide pages in Setup. */
  protected readonly sections = computed(() => PROFILE_PAGES.filter((x) => x.id === 'overview' || (!this.store.hiddenPages().includes(x.id) && (x.id === 'appointments' ? this.auth.can('appointments.view') : this.auth.can(x.clinical ? 'clinical.view' : 'billing.view')))).map((x) => x.id as Section));
  protected readonly sectionKey = Object.fromEntries(PROFILE_PAGES.map((x) => [x.id, x.key])) as Record<Section, Key>;
  protected readonly pageIcon = Object.fromEntries(PROFILE_PAGES.map((x) => [x.id, x.icon])) as Record<Section, string>;
  protected readonly section = computed<Section>(() => {
    const want = (this.page() ?? (this.note() ? 'visits' : 'overview')) as Section; // a link from the calendar lands on the notes
    return this.sections().includes(want) ? want : 'overview';
  });
  /** The tab bar scrolls sideways on narrower screens: keep the open tab visible. */
  private readonly keepTabVisible = effect(() => {
    this.section();
    if (typeof document === 'undefined') return;
    setTimeout(() => document.querySelector('.page-link.on')?.scrollIntoView({ inline: 'nearest', block: 'nearest' }), 150);
  });
  /** WhatsApp messages ready to send (the clinic presses send): next visit, balance due, check-up invitation. */
  protected readonly reminders = computed(() => {
    const p = this.patient();
    if (!p) return null;
    const clinic = this.docs.clinicName();
    const next = this.upcoming().find((a) => a.status === 'scheduled' || a.status === 'confirmed') ?? null;
    const due = this.money().due;
    const link = (m: string) => messageLink(p, m);
    const v = (extra: Record<string, string>) => ({ name: p.fullName, clinic, ...extra });
    const day = next ? this.i18n.date(next.start, { weekday: 'long', day: 'numeric', month: 'long' }) : '';
    const time = next ? this.i18n.time(next.start) : '';
    const amount = this.i18n.money(due);
    const text = {
      appointment: next ? this.store.message('appointment', this.t('reminder.message', v({ day, time })), v({ day, time })) : '',
      balance: due > 0 ? this.store.message('balance', this.t('reminder.balance', v({ amount })), v({ amount })) : '',
      recall: this.store.message('recall', this.t('recall.message', v({})), v({})),
    };
    return {
      next, text,
      appointment: text.appointment ? link(text.appointment) : null,
      balance: text.balance ? link(text.balance) : null,
      recall: link(text.recall),
      hasNumber: whatsappNumber(p.phone) !== null,
      declined: p.whatsappConsent === 'declined',
    };
  });
  protected readonly askArchive = signal(false);
  protected readonly merging = signal(false);
  protected readonly mergeFrom = signal('');
  private readonly patientApi = inject(PatientApi);
  /** A profile opened from a link may not be in the cache yet (server mode). */
  private readonly checked = signal(false);
  private readonly fetchIfMissing = effect(() => {
    const id = this.id();
    if (!this.store.server || !this.store.loaded()) return;
    untracked(() => {
      void this.store.ensurePatient(id).then(() => this.checked.set(true));
      void this.store.loadPatientAppointments(id).catch(() => undefined); // the newest 50 visits; the rest stay on the server
    });
  });
  /** Shown when the server refuses or cannot be reached (archive, restore, merge). */
  protected readonly actionError = signal('');
  /** Server mode: the files that look like this one, from the server (at most 10); local mode lists the cached patients. */
  private readonly duplicates = signal<Patient[]>([]);
  protected async startMerge(): Promise<void> {
    this.merging.set(true);
    if (this.store.server) this.duplicates.set(await this.patientApi.duplicates(this.id()).catch(() => []));
  }
  protected async archive(on: boolean): Promise<void> {
    this.askArchive.set(false); this.actionError.set('');
    try { await this.store.setArchived(this.id(), on); } catch (e) { this.actionError.set(apiMessage(e)); }
  }
  protected readonly mergeChoices = computed(() => this.store.server ? this.duplicates() : this.store.patients().filter((x) => x.id !== this.id() && !x.archivedAt).sort((a, b) => a.fullName.localeCompare(b.fullName)).slice(0, 200));
  protected async merge(): Promise<void> {
    const other = this.mergeFrom();
    this.actionError.set('');
    try { if (other && await this.store.mergePatients(this.id(), other)) { this.merging.set(false); this.mergeFrom.set(''); } } catch (e) { this.actionError.set(apiMessage(e)); }
  }
  protected readonly sentMessages = computed(() => [...(this.patient()?.messages ?? [])].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8));
  protected readonly kindKey = { appointment: 'profile.remind.appt', balance: 'profile.remind.balance', recall: 'profile.remind.recall' } as const;
  protected readonly statusKey = { prepared: 'wa.status.prepared', sent: 'wa.status.sent', delivered: 'wa.status.delivered', read: 'wa.status.read', failed: 'wa.status.failed' } as const;
  protected day2(iso: string): string { return this.i18n.date(new Date(iso), { day: 'numeric', month: 'short', year: 'numeric' }); }
  protected wa(phone: string): string | null { const n = whatsappNumber(phone); return n ? `https://wa.me/${n}` : null; }
  /** Everything that happened to this patient, newest first: acts done, payments, visit notes and appointments. */
  protected readonly feed = computed(() => {
    const p = this.patient();
    if (!p) return [];
    const t = this.t;
    type Item = { key: string; at: Date; icon: string; tone: string; title: string; sub?: string; amount?: number };
    const out: Item[] = [];
    for (const i of p.plan ?? []) if (i.status === 'done') out.push({ key: 'a' + i.id, at: new Date(i.doneAt ?? `${i.date ?? '1970-01-01'}T12:00:00`), icon: 'fa-tooth', tone: 'ok', title: procedureName(t, i.procedure, i.name), sub: i.tooth ? `${t('plan.tooth')} ${i.tooth}` : undefined, amount: i.price });
    for (const x of p.payments ?? []) out.push({ key: 'p' + x.id, at: new Date(x.at), icon: 'fa-wallet', tone: 'info', title: t('profile.feed.payment'), sub: x.method, amount: x.amount });
    for (const v of p.visits ?? []) out.push({ key: 'v' + v.id, at: new Date(v.at), icon: 'fa-notes-medical', tone: 'neutral', title: t('profile.visits'), sub: v.complaint || v.findings || v.care });
    for (const a of this.appointments()) out.push({ key: 'c' + a.id, at: a.start, icon: 'fa-calendar-check', tone: 'neutral', title: t(typeKey(a.type)), sub: t(STATUS_KEY[a.status]) });
    for (const i of p.invoices ?? []) out.push({ key: 'i' + i.id, at: new Date(i.issuedAt), icon: 'fa-file-invoice', tone: 'info', title: t(i.kind === 'credit-note' ? 'profile.feed.credit' : 'profile.feed.invoice'), sub: i.number, amount: i.total });
    for (const l of p.letters ?? []) out.push({ key: 'l' + l.id, at: new Date(l.at), icon: 'fa-file-lines', tone: 'neutral', title: t(l.kind === 'referral' ? 'letter.referral' : 'letter.certificate') });
    for (const r of p.prescriptions ?? []) if (r.issuedAt) out.push({ key: 'r' + r.id, at: new Date(r.issuedAt), icon: 'fa-prescription', tone: 'neutral', title: t('profile.feed.rx'), sub: r.number });
    return out.sort((x, y) => y.at.getTime() - x.at.getTime());
  });
  protected readonly feedShown = signal(20);
  protected readonly feedPage = computed(() => this.feed().slice(0, this.feedShown()));
  protected readonly money = computed(() => { const p = this.patient(); return balance(planInCurrency(p?.plan ?? [], this.store.currency()), inCurrency(p?.payments ?? [], this.store.currency()), refundedTotal(inCurrency(p?.invoices ?? [], this.store.currency()))); });
  /** What the patient still owes, shown as a dot on the Billing tab. */
  protected readonly due = computed(() => {
    const p = this.patient();
    return p ? balance(planInCurrency(p.plan ?? [], this.store.currency()), inCurrency(p.payments ?? [], this.store.currency()), refundedTotal(inCurrency(p.invoices ?? [], this.store.currency()))).due : 0;
  });
  /** Tooth chosen in the chart for the next plan item. */
  // Only read once the store has loaded, which only happens in the browser.
  private readonly now = new Date();

  protected readonly patient = computed(() => this.store.patientMap().get(this.id()) ?? null);
  protected readonly missing = computed(() => this.store.loaded() && !this.patient() && (!this.store.server || this.checked()));

  protected readonly appointments = computed(() => this.store.appointments().filter((a) => a.patientId === this.id()));

  protected readonly upcoming = computed(() =>
    this.appointments()
      // a patient who is waiting or in the chair is current, even if the booked slot has run over
      .filter((a) => isActive(a) && a.status !== 'completed' && (a.end >= this.now || a.status === 'arrived' || a.status === 'in-progress'))
      .sort((a, b) => a.start.getTime() - b.start.getTime()),
  );

  protected readonly history = computed(() => {
    const upcoming = new Set(this.upcoming().map((a) => a.id));
    return this.appointments()
      .filter((a) => !upcoming.has(a.id))
      .sort((a, b) => b.start.getTime() - a.start.getTime());
  });

  protected readonly stats = computed(() => {
    const all = this.appointments();
    const completed = all.filter((a) => a.status === 'completed');
    const last = completed.reduce<Appointment | null>((best, a) => (!best || a.start > best.start ? a : best), null);
    return {
      visits: completed.length,
      upcoming: this.upcoming().length,
      noShows: all.filter((a) => a.status === 'no-show').length,
      last,
    };
  });

  protected readonly age = computed(() => ageOn(this.patient()?.birthDate, this.now));

  protected readonly rows = computed(() => (this.tab() === 'upcoming' ? this.upcoming() : this.history()));

  protected dentist(a: Appointment) {
    return this.store.dentistMap().get(a.dentistId);
  }

  protected day(a: Appointment): string {
    return relativeDay(this.i18n, a.start, this.now);
  }

  protected month(a: Appointment): string {
    return this.i18n.date(a.start, { month: 'short' });
  }

  protected dateOnly(iso: string | undefined): string {
    const date = iso ? parseIsoDate(iso) : null;
    return date ? this.i18n.date(date, { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  }

  protected since(): string {
    const created = this.patient()?.createdAt;
    return created ? this.i18n.date(new Date(created), { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  }

  protected isoDay(a: Appointment): string {
    return localIsoDay(a.start);
  }

  /** Shrinks the chosen picture to a 256px JPEG so a photo costs a few KB, not a few MB. */
  protected async pickPhoto(e: Event, id: string): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file?.type.startsWith('image/')) return;
    try {
      const bmp = await createImageBitmap(file);
      const side = Math.min(bmp.width, bmp.height), size = Math.min(256, side);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      canvas.getContext('2d')!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size); // centred square crop
      this.store.setPhoto(id, canvas.toDataURL('image/jpeg', 0.85));
    } catch { /* not a readable image: keep the current photo */ }
  }
}
