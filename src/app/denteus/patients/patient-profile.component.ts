import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { I18n, Key } from '../../core/i18n/i18n.service';
import { Appointment } from '../models/dental.models';
import { DentalStore } from '../services/dental-store.service';
import { STATUS_KEY, STATUS_TONE, isActive, localIsoDay, relativeDay, typeKey } from '../utils/appointment-labels';
import { ageOn, initials, parseIsoDate } from './patient-rules';
import { balance, procedureName } from './treatment-rules';
import { reminderLink, whatsappNumber } from './reminder-rules';
import { DentalChartComponent } from '../odontogram/dental-chart.component';
import { BillingComponent } from './billing.component';
import { DocumentsComponent } from './documents.component';
import { VisitNotesComponent } from './visit-notes.component';
import { TreatmentPlanComponent } from './treatment-plan.component';
import { PROFILE_PAGES, Section } from './profile-pages';
import { ActEditorComponent } from './act-editor.component';
import { FormsComponent } from '../forms/forms.component';

type Tab = 'upcoming' | 'history';

@Component({
  selector: 'den-patient-profile',
  imports: [RouterLink, ActEditorComponent, FormsComponent, DentalChartComponent, TreatmentPlanComponent, BillingComponent, VisitNotesComponent, DocumentsComponent],
  templateUrl: './patient-profile.component.html',
  styleUrl: './patient-profile.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ds-page' },
})
export class PatientProfileComponent {
  /** Bound from the route (`/patients/:id`). */
  readonly id = input.required<string>();
  /** Appointment to write a visit note for (`/patients/:id?note=<appointment id>`, from the calendar). */
  readonly note = input<string>();
  /** Which page of the file is open (`/patients/:id/:page`). Unknown or forbidden pages fall back to the overview. */
  readonly page = input<string>();

  protected readonly store = inject(DentalStore);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly STATUS_KEY = STATUS_KEY;
  protected readonly STATUS_TONE = STATUS_TONE;
  protected readonly typeKey = typeKey;
  protected readonly initials = initials;

  protected readonly tab = signal<Tab>('upcoming');
  private readonly auth = inject(AuthService);
  /** Dentists don't see billing, reception doesn't see clinical records, and the clinic can hide pages in Setup. */
  protected readonly sections = computed(() => PROFILE_PAGES.filter((x) => x.id === 'overview' || (!this.store.hiddenPages().includes(x.id) && (x.id === 'appointments' || this.auth.can(x.clinical ? 'clinical' : 'billing')))).map((x) => x.id as Section));
  protected readonly sectionKey = Object.fromEntries(PROFILE_PAGES.map((x) => [x.id, x.key])) as Record<Section, Key>;
  protected readonly pageIcon = Object.fromEntries(PROFILE_PAGES.map((x) => [x.id, x.icon])) as Record<Section, string>;
  protected readonly section = computed<Section>(() => {
    const want = (this.page() ?? (this.note() ? 'visits' : 'overview')) as Section; // a link from the calendar lands on the notes
    return this.sections().includes(want) ? want : 'overview';
  });
  protected readonly adding = signal(false);
  /** WhatsApp messages ready to send (the clinic presses send): next visit, balance due, check-up invitation. */
  protected readonly reminders = computed(() => {
    const p = this.patient();
    if (!p) return null;
    const clinic = this.store.locations()[0]?.name ?? 'Dentaleus';
    const next = this.upcoming().find((a) => a.status === 'scheduled' || a.status === 'confirmed') ?? null;
    const due = this.money().due;
    const link = (m: string) => reminderLink(p.phone, m);
    return {
      next,
      appointment: next ? link(this.t('reminder.message', { name: p.fullName, clinic, day: this.i18n.date(next.start, { weekday: 'long', day: 'numeric', month: 'long' }), time: this.i18n.time(next.start) })) : null,
      balance: due > 0 ? link(this.t('reminder.balance', { name: p.fullName, clinic, amount: this.i18n.money(due) })) : null,
      recall: link(this.t('recall.message', { name: p.fullName, clinic })),
      hasNumber: link('x') !== null,
    };
  });
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
    return out.sort((x, y) => y.at.getTime() - x.at.getTime()).slice(0, 40);
  });
  protected readonly money = computed(() => { const p = this.patient(); return balance(p?.plan ?? [], p?.payments ?? []); });
  /** What the patient still owes, shown as a dot on the Billing tab. */
  protected readonly due = computed(() => {
    const p = this.patient();
    return p ? balance(p.plan ?? [], p.payments ?? []).due : 0;
  });
  /** Tooth chosen in the chart for the next plan item. */
  // Only read once the store has loaded, which only happens in the browser.
  private readonly now = new Date();

  protected readonly patient = computed(() => this.store.patientMap().get(this.id()) ?? null);
  protected readonly missing = computed(() => this.store.loaded() && !this.patient());

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
    const completed = all.filter((a) => a.status === 'completed' && a.start <= this.now);
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
