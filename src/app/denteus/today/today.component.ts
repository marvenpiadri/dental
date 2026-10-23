import { ChangeDetectionStrategy, Component, DestroyRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { isSameDay } from '../../calendar/utils/date.utils';
import { I18n } from '../../core/i18n/i18n.service';
import { Appointment } from '../models/dental.models';
import { DentalStore } from '../services/dental-store.service';
import { STATUS_KEY, STATUS_TONE, isActive, localIsoDay, typeKey, waitingMinutes } from '../utils/appointment-labels';
import { initials } from '../patients/patient-rules';

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
