import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { CalIconComponent } from '../../../calendar/components/cal-icon/cal-icon.component';
import { formatTime } from '../../../calendar/utils/date.utils';
import { APPOINTMENT_TYPES, Appointment, AppointmentStatus, STATUS_META } from '../../models/dental.models';
import { TRANSITIONS, isMovable } from '../../rules/scheduling-rules';
import { DentalStore } from '../../services/dental-store.service';

interface Action {
  to: AppointmentStatus;
  label: string;
  kind: 'primary' | 'normal' | 'danger';
}

interface HistoryLine {
  at: Date;
  text: string;
  by: string;
}

const ACTION_LABEL: Record<AppointmentStatus, string> = {
  scheduled: 'Reinstate appointment',
  confirmed: 'Mark as confirmed',
  arrived: 'Patient has arrived',
  'in-progress': 'Start treatment',
  completed: 'Complete visit',
  cancelled: 'Cancel appointment',
  'no-show': 'Mark as no-show',
};

/** Right-hand detail panel: everything about one appointment and the actions that apply to it. */
@Component({
  selector: 'den-appointment-panel',
  imports: [CalIconComponent],
  templateUrl: './appointment-panel.component.html',
  styleUrl: './appointment-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'complementary', '[attr.aria-label]': "'Appointment details'" },
})
export class AppointmentPanelComponent {
  readonly appointment = input.required<Appointment>();

  readonly close = output<void>();
  readonly edit = output<void>();
  readonly transition = output<AppointmentStatus>();
  readonly openPatient = output<string>();
  readonly openEncounter = output<string>();

  protected readonly store = inject(DentalStore);
  protected readonly meta = STATUS_META;

  protected readonly patient = computed(() => this.store.patientMap().get(this.appointment().patientId));
  protected readonly dentist = computed(() => this.store.dentistMap().get(this.appointment().dentistId));
  protected readonly chair = computed(() => this.store.chairMap().get(this.appointment().chairId));
  protected readonly typeLabel = computed(() => APPOINTMENT_TYPES.find((t) => t.id === this.appointment().type)?.label ?? '');
  protected readonly movable = computed(() => isMovable(this.appointment().status));

  protected readonly minutes = computed(() => Math.round((this.appointment().end.getTime() - this.appointment().start.getTime()) / 60_000));
  protected readonly dateLabel = computed(() =>
    new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'long' }).format(this.appointment().start),
  );
  protected readonly timeLabel = computed(() => `${formatTime(this.appointment().start)} – ${formatTime(this.appointment().end)}`);

  protected readonly actions = computed<Action[]>(() =>
    TRANSITIONS[this.appointment().status].map((to) => ({
      to,
      label: ACTION_LABEL[to],
      kind: to === 'cancelled' || to === 'no-show' ? 'danger' : to === 'in-progress' || to === 'arrived' || to === 'completed' ? 'primary' : 'normal',
    })),
  );

  /** The clinical encounter belongs to the clinical module; the panel only offers a way in once the patient is here. */
  protected readonly encounterAvailable = computed(() => ['arrived', 'in-progress', 'completed'].includes(this.appointment().status));

  protected readonly history = computed<HistoryLine[]>(() => {
    const a = this.appointment();
    const lines: HistoryLine[] = a.history.map((h) => ({
      at: h.at,
      by: h.by,
      text: h.from === null ? `Booked as ${STATUS_META[h.to].label.toLowerCase()}` : `${STATUS_META[h.from].label} → ${STATUS_META[h.to].label}`,
    }));
    for (const s of a.scheduleHistory) {
      const dentistChanged = s.fromDentistId !== s.toDentistId ? ` with ${this.store.dentistMap().get(s.toDentistId)?.name}` : '';
      const chairChanged = s.fromChairId !== s.toChairId ? ` in ${this.store.chairMap().get(s.toChairId)?.name}` : '';
      lines.push({
        at: s.at,
        by: s.by,
        text: `Rescheduled from ${formatShort(s.fromStart)} to ${formatShort(s.toStart)}${dentistChanged}${chairChanged}`,
      });
    }
    return lines.sort((x, y) => y.at.getTime() - x.at.getTime());
  });

  protected stamp(d: Date): string {
    return `${formatShort(d)}`;
  }
}

function formatShort(d: Date): string {
  return `${new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' }).format(d)}, ${formatTime(d)}`;
}
