import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { CalendarTheme } from './calendar/models/calendar.models';
import { DentalCalendarComponent } from './denteus/dental-calendar.component';
import { PatientWorkspaceComponent } from './denteus/patients/patient-workspace.component';

type WorkspacePage = 'calendar' | 'patients';

@Component({ selector: 'app-root', imports: [DentalCalendarComponent, PatientWorkspaceComponent], templateUrl: './app.html', styleUrl: './app.css', changeDetection: ChangeDetectionStrategy.OnPush })
export class App {
  protected readonly dark = signal(false);
  protected readonly page = signal<WorkspacePage>('calendar');
  protected navigate(page: WorkspacePage): void { this.page.set(page); }
  protected onTheme(theme: CalendarTheme): void { this.dark.set(theme === 'dark'); }
  protected onOpenPatient(patientId: string): void { this.navigate('patients'); console.info('open patient file', patientId); }
  protected onOpenEncounter(appointmentId: string): void { console.info('open clinical encounter for appointment', appointmentId); }
}
