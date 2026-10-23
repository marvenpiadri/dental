import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n/i18n.service';
import { Appointment } from '../models/dental.models';
import { DentalStore } from '../services/dental-store.service';
import { STATUS_KEY, STATUS_TONE, isActive, localIsoDay, relativeDay, typeKey } from '../utils/appointment-labels';
import { ageOn, initials, parseIsoDate } from './patient-rules';
import { ToothChartComponent } from './tooth-chart.component';

type Tab = 'upcoming' | 'history';

@Component({
  selector: 'den-patient-profile',
  imports: [RouterLink, ToothChartComponent],
  templateUrl: './patient-profile.component.html',
  styleUrl: './patient-profile.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ds-page' },
})
export class PatientProfileComponent {
  /** Bound from the route (`/patients/:id`). */
  readonly id = input.required<string>();

  protected readonly store = inject(DentalStore);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly STATUS_KEY = STATUS_KEY;
  protected readonly STATUS_TONE = STATUS_TONE;
  protected readonly typeKey = typeKey;
  protected readonly initials = initials;

  protected readonly tab = signal<Tab>('upcoming');
  // Only read once the store has loaded, which only happens in the browser.
  private readonly now = new Date();

  protected readonly patient = computed(() => this.store.patientMap().get(this.id()) ?? null);
  protected readonly missing = computed(() => this.store.loaded() && !this.patient());

  private readonly appointments = computed(() => this.store.appointments().filter((a) => a.patientId === this.id()));

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
