import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { CalendarViewType } from '../../models/calendar.models';
import { CalendarStore } from '../../services/calendar-store.service';
import { CalIconComponent } from '../cal-icon/cal-icon.component';

@Component({
  selector: 'cal-toolbar',
  imports: [CalIconComponent],
  templateUrl: './calendar-toolbar.component.html',
  styleUrl: './calendar-toolbar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarToolbarComponent {
  protected readonly store = inject(CalendarStore);

  readonly searchPlaceholder = input('Search');
  readonly newLabel = input('New event');
  readonly newEvent = output<void>();
  readonly toggleSidebar = output<void>();
  readonly toggleTheme = output<void>();

  protected readonly views: { id: CalendarViewType; label: string }[] = [
    { id: 'day', label: 'Day' },
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
    { id: 'year', label: 'Year' },
  ];

  protected onSearch(event: Event): void {
    this.store.search.set((event.target as HTMLInputElement).value);
  }
}
