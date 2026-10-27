import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { I18n, type Key } from '../../../core/i18n/i18n.service';
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
  protected readonly t = inject(I18n).t;

  readonly searchPlaceholder = input('Search');
  readonly newLabel = input('New event');
  readonly newEvent = output<void>();
  readonly toggleSidebar = output<void>();

  protected readonly views: { id: CalendarViewType; key: Key }[] = [
    { id: 'day', key: 'cal.day' },
    { id: 'week', key: 'cal.week' },
    { id: 'month', key: 'cal.month' },
    { id: 'year', key: 'cal.year' },
  ];

  protected onSearch(event: Event): void {
    this.store.search.set((event.target as HTMLInputElement).value);
  }
}
