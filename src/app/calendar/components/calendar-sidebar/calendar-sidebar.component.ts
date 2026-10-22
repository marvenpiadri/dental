import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { CalendarStore } from '../../services/calendar-store.service';
import { CalIconComponent } from '../cal-icon/cal-icon.component';
import { MiniCalendarComponent } from '../mini-calendar/mini-calendar.component';

@Component({
  selector: 'cal-sidebar',
  imports: [CalIconComponent, MiniCalendarComponent],
  templateUrl: './calendar-sidebar.component.html',
  styleUrl: './calendar-sidebar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarSidebarComponent {
  protected readonly store = inject(CalendarStore);

  readonly brand = input('Schedule');
  /** Small heading above the list of calendars (e.g. "Dentists"). Empty hides it. */
  readonly heading = input('');
}
