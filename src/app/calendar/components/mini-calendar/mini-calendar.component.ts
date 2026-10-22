import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { CalendarStore } from '../../services/calendar-store.service';
import {
  addDays,
  addMonths,
  dateKey,
  isSameDay,
  isSameMonth,
  monthLabel,
  monthMatrix,
  startOfDay,
  startOfMonth,
  startOfWeek,
  weekdayLabel,
} from '../../utils/date.utils';
import { CalIconComponent } from '../cal-icon/cal-icon.component';

interface MiniDay {
  key: string;
  date: Date;
  label: number;
  outside: boolean;
  today: boolean;
  selected: boolean;
  inFocusWeek: boolean;
}

@Component({
  selector: 'cal-mini-calendar',
  imports: [CalIconComponent],
  templateUrl: './mini-calendar.component.html',
  styleUrl: './mini-calendar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MiniCalendarComponent {
  protected readonly store = inject(CalendarStore);

  /** Month shown by the mini calendar; follows the main calendar, but can be browsed freely. */
  private readonly cursor = linkedSignal(() => startOfMonth(this.store.focusDate()));

  protected readonly title = computed(() => {
    const c = this.cursor();
    return `${monthLabel(c, this.store.locale())} ${c.getFullYear()}`;
  });

  protected readonly weekdays = computed(() => {
    const monday = startOfWeek(new Date(2024, 0, 3), this.store.weekStartsOn());
    return Array.from({ length: 7 }, (_, i) => weekdayLabel(addDays(monday, i), this.store.locale(), 'narrow'));
  });

  protected readonly weeks = computed<MiniDay[][]>(() => {
    const cursor = this.cursor();
    const today = this.store.today();
    const focus = this.store.focusDate();
    const focusWeek = startOfWeek(focus, this.store.weekStartsOn()).getTime();
    const highlightWeek = this.store.view() === 'week';
    return monthMatrix(cursor, this.store.weekStartsOn()).map((week) =>
      week.map((date) => ({
        key: dateKey(date),
        date,
        label: date.getDate(),
        outside: !isSameMonth(date, cursor),
        today: isSameDay(date, today),
        selected: isSameDay(date, focus) && !isSameDay(date, today),
        inFocusWeek: highlightWeek && startOfWeek(date, this.store.weekStartsOn()).getTime() === focusWeek,
      })),
    );
  });

  protected prev(): void {
    this.cursor.set(addMonths(this.cursor(), -1));
  }

  protected next(): void {
    this.cursor.set(addMonths(this.cursor(), 1));
  }

  protected select(date: Date): void {
    this.store.goToDate(startOfDay(date));
  }
}
