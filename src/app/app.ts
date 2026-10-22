import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { CalendarTheme } from './calendar/models/calendar.models';
import { DentalCalendarComponent } from './denteus/dental-calendar.component';

@Component({
  selector: 'app-root',
  imports: [DentalCalendarComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly dark = signal(false);

  protected onTheme(theme: CalendarTheme): void {
    this.dark.set(theme === 'dark');
  }

  /** In Denteus these navigate to the patient file and the clinical encounter screens. */
  protected onOpenPatient(patientId: string): void {
    console.info('open patient file', patientId);
  }

  protected onOpenEncounter(appointmentId: string): void {
    console.info('open clinical encounter for appointment', appointmentId);
  }
}
