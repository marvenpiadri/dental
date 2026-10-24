import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n, Key } from '../../core/i18n/i18n.service';
import { Appointment } from '../models/dental.models';
import { DentalStore } from '../services/dental-store.service';
import { STATUS_KEY, STATUS_TONE, isActive, localIsoDay, relativeDay, typeKey } from '../utils/appointment-labels';
import { ageOn, initials, parseIsoDate } from './patient-rules';
import { balance } from './treatment-rules';
import { ToothChartComponent } from './tooth-chart.component';
import { BillingComponent } from './billing.component';
import { DocumentsComponent } from './documents.component';
import { VisitNotesComponent } from './visit-notes.component';
import { TreatmentPlanComponent } from './treatment-plan.component';

type Tab = 'upcoming' | 'history';
type Section = 'overview' | 'clinical' | 'billing';

@Component({
  selector: 'den-patient-profile',
  imports: [RouterLink, ToothChartComponent, TreatmentPlanComponent, BillingComponent, VisitNotesComponent, DocumentsComponent],
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

  protected readonly store = inject(DentalStore);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly STATUS_KEY = STATUS_KEY;
  protected readonly STATUS_TONE = STATUS_TONE;
  protected readonly typeKey = typeKey;
  protected readonly initials = initials;

  protected readonly tab = signal<Tab>('upcoming');
  protected readonly sections: Section[] = ['overview', 'clinical', 'billing'];
  protected readonly sectionKey: Record<Section, Key> = { overview: 'profile.section.overview', clinical: 'profile.section.clinical', billing: 'profile.section.billing' };
  protected readonly section = signal<Section>('overview');
  /** What the patient still owes, shown as a dot on the Billing tab. */
  protected readonly due = computed(() => {
    const p = this.patient();
    return p ? balance(p.plan ?? [], p.payments ?? []).due : 0;
  });
  private readonly openNoteTab = effect(() => { if (this.note()) this.section.set('clinical'); }); // a link from the calendar lands on the notes
  /** Tooth chosen in the chart for the next plan item. */
  protected readonly planTooth = signal<string | null>(null);
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
}
