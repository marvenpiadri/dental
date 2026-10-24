import { ChangeDetectionStrategy, Component, DestroyRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { isSameDay } from '../../calendar/utils/date.utils';
import { I18n } from '../../core/i18n/i18n.service';
import { Appointment } from '../models/dental.models';
import { DentalStore } from '../services/dental-store.service';
import { STATUS_KEY, STATUS_TONE, isActive, localIsoDay, typeKey, waitingMinutes } from '../utils/appointment-labels';
import { initials } from '../patients/patient-rules';
import { recallDue } from '../patients/recall-rules';
import { reminderLink } from '../patients/reminder-rules';
import { balance } from '../patients/treatment-rules';

/** The front desk's morning view: what is booked, who is waiting, who is next. */
@Component({
  selector: 'den-today',
  imports: [RouterLink],
  templateUrl: './today.component.html',
  styleUrl: './today.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ds-page' },
})
export class TodayComponent {
  protected readonly store = inject(DentalStore);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly STATUS_KEY = STATUS_KEY;
  protected readonly STATUS_TONE = STATUS_TONE;
  protected readonly typeKey = typeKey;
  protected readonly initials = initials;
  protected readonly isoDay = localIsoDay;

  /**
   * The clock starts empty on the server and is set in the browser: the server's "now" is not the
   * visitor's, and a page that depends on it must not be rendered there.
   */
  protected readonly now = signal<Date | null>(null);

  constructor() {
    const destroyRef = inject(DestroyRef); // must be taken here: inject() doesn't work inside the callback below
    afterNextRender(() => {
      this.now.set(new Date());
      const timer = setInterval(() => this.now.set(new Date()), 30_000);
      destroyRef.onDestroy(() => clearInterval(timer));
    });
  }

  protected readonly dateLabel = computed(() => {
    const now = this.now();
    return now ? this.i18n.date(now, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
  });

  private readonly todays = computed(() => {
    const now = this.now();
    if (!now) return [];
    return this.store
      .appointments()
      .filter((a) => isSameDay(a.start, now))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  });

  protected readonly waiting = computed(() => this.todays().filter((a) => a.status === 'arrived'));
  protected readonly upcoming = computed(() => this.todays().filter((a) => a.status === 'scheduled' || a.status === 'confirmed'));

  protected readonly counts = computed(() => {
    const today = this.todays();
    const count = (status: Appointment['status']) => today.filter((a) => a.status === status).length;
    return {
      booked: today.filter(isActive).length,
      waiting: count('arrived'),
      inTreatment: count('in-progress'),
      completed: count('completed'),
    };
  });

  protected readonly dentists = computed(() => {
    const now = this.now();
    const today = this.todays().filter(isActive);
    return this.store.dentists().map((dentist) => {
      const visits = today.filter((a) => a.dentistId === dentist.id);
      const next = visits.find((a) => now && a.end > now && a.status !== 'completed');
      return { dentist, visits: visits.length, next: next?.start ?? null };
    });
  });

  /** Tomorrow's visits that still need a reminder: booked or confirmed, with a WhatsApp link when the number allows. */
  protected readonly tomorrow = computed(() => {
    const now = this.now();
    if (!now) return [];
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return this.store.appointments()
      .filter((a) => isSameDay(a.start, day) && (a.status === 'scheduled' || a.status === 'confirmed'))
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .map((a) => {
        const patient = this.store.patientMap().get(a.patientId);
        const message = this.t('reminder.message', {
          name: patient?.fullName ?? '',
          clinic: this.store.locations()[0]?.name ?? 'Dentaleus',
          day: this.i18n.date(a.start, { weekday: 'long', day: 'numeric', month: 'long' }),
          time: this.i18n.time(a.start),
        });
        return { appointment: a, patient, link: patient ? reminderLink(patient.phone, message) : null };
      });
  });

  /** Patients who still owe money, biggest balance first. Only the top few are listed; the total covers everyone. */
  protected readonly owing = computed(() => {
    const rows = this.store.patients()
      .map((patient) => ({ patient, due: balance(patient.plan ?? [], patient.payments ?? []).due }))
      .filter((row) => row.due > 0)
      .sort((a, b) => b.due - a.due);
    return { rows: rows.slice(0, 5), count: rows.length, total: rows.reduce((n, row) => n + row.due, 0) };
  });

  /** Patients overdue for a check-up, with a WhatsApp link to invite them. */
  protected readonly recall = computed(() => {
    const now = this.now();
    if (!now) return { rows: [], count: 0 };
    const all = recallDue(this.store.patients(), this.store.appointments(), now);
    const clinic = this.store.locations()[0]?.name ?? 'Dentaleus';
    const rows = all.slice(0, 5).map(({ patient, lastVisit }) => ({
      patient,
      lastVisit,
      link: reminderLink(patient.phone, this.t('recall.message', { name: patient.fullName, clinic })),
    }));
    return { rows, count: all.length };
  });

  protected patientName(a: Appointment): string {
    return this.store.patientMap().get(a.patientId)?.fullName ?? '—';
  }

  protected dentistOf(a: Appointment) {
    return this.store.dentistMap().get(a.dentistId);
  }

  protected wait(a: Appointment): number | null {
    const now = this.now();
    return now ? waitingMinutes(a, now) : null;
  }
}
