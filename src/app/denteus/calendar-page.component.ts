import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { DentalCalendarComponent } from './dental-calendar.component';
import { DentalStore } from './services/dental-store.service';

/**
 * The calendar depends on the clock and the browser's time zone, which the server doesn't share:
 * rendering it on the server would paint the wrong "today". So the server sends the empty frame and the
 * calendar mounts in the browser (`@defer` renders only the placeholder on the server).
 *
 * Query parameters arrive as inputs, so other pages can link here:
 *   /calendar?date=2026-10-23&appointment=<id>   open a day with a visit selected
 *   /calendar?book=1&patient=<id>                start a booking, for that patient if given
 */
@Component({
  selector: 'den-calendar-page',
  imports: [DentalCalendarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; height: 100%; min-height: 0; }
  `,
  template: `
    @defer (on immediate) {
      <den-calendar
        [initialDate]="date()"
        [initialAppointment]="appointment()"
        [bookNew]="booking()"
        [bookForPatient]="patient()"
        (openPatient)="openPatient($event)"
        (openEncounter)="openVisitNote($event)"
      />
    } @placeholder {
      <div class="skeleton" style="height: 100%" aria-busy="true"></div>
    }
  `,
})
export class CalendarPageComponent {
  readonly date = input<string>();
  readonly appointment = input<string>();
  readonly patient = input<string>();
  readonly book = input<string>();

  protected readonly booking = computed(() => this.book() === '1');
  private readonly router = inject(Router);
  private readonly store = inject(DentalStore);

  protected openPatient(patientId: string): void {
    void this.router.navigate(['/patients', patientId]);
  }

  /** The panel's "visit note" button: the note is written on the patient's file, linked to this appointment. */
  protected openVisitNote(appointmentId: string): void {
    const appointment = this.store.appointments().find((a) => a.id === appointmentId);
    if (appointment) void this.router.navigate(['/patients', appointment.patientId], { queryParams: { note: appointmentId } });
  }
}
