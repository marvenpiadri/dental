import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { CalIconComponent } from '../../../calendar/components/cal-icon/cal-icon.component';
import { CalendarStore } from '../../../calendar/services/calendar-store.service';
import { formatTime } from '../../../calendar/utils/date.utils';
import { Appointment } from '../../models/dental.models';
import { DentalStore } from '../../services/dental-store.service';

interface Row {
  id: string;
  patient: string;
  dentist: string;
  color: string;
  time: string;
  waited: string;
}

/**
 * Today's patients who have arrived, read straight from the appointments (not a separate list),
 * so changing a status anywhere updates this block.
 */
@Component({
  selector: 'den-waiting-room',
  imports: [CalIconComponent],
  templateUrl: './waiting-room.component.html',
  styleUrl: './waiting-room.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WaitingRoomComponent {
  readonly appointments = input.required<Appointment[]>();
  /** Number of patients in treatment right now. */
  readonly inTreatment = input(0);
  readonly select = output<string>();

  private readonly dental = inject(DentalStore);
  private readonly cal = inject(CalendarStore);

  protected readonly rows = computed<Row[]>(() => {
    const now = this.cal.now().getTime();
    return this.appointments().map((a) => {
      const arrived = [...a.history].reverse().find((h) => h.to === 'arrived')?.at ?? a.start;
      const minutes = Math.max(0, Math.round((now - arrived.getTime()) / 60_000));
      const dentist = this.dental.dentistMap().get(a.dentistId);
      return {
        id: a.id,
        patient: this.dental.patientMap().get(a.patientId)?.fullName ?? 'Unknown patient',
        dentist: dentist?.name ?? '',
        color: dentist?.color ?? '#64748b',
        time: formatTime(a.start),
        waited: minutes < 1 ? 'just arrived' : `waiting ${minutes} min`,
      };
    });
  });
}
