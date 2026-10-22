import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CalendarStore } from '../../services/calendar-store.service';
import {
  addDays,
  dateKey,
  diffDays,
  eventFirstDay,
  eventLastDay,
  isSameDay,
  isSameMonth,
  monthLabel,
  monthMatrix,
  startOfWeek,
  weekdayLabel,
} from '../../utils/date.utils';

interface YearDay {
  key: string;
  date: Date;
  label: number;
  today: boolean;
  dots: string[];
  count: number;
}

interface YearMonth {
  key: string;
  date: Date;
  name: string;
  weeks: (YearDay | null)[][];
}

/** Twelve small months; coloured dots show which calendars have events that day. */
@Component({
  selector: 'cal-year-view',
  templateUrl: './year-view.component.html',
  styleUrl: './year-view.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class YearViewComponent {
  protected readonly store = inject(CalendarStore);

  protected readonly weekdays = computed(() => {
    const start = startOfWeek(new Date(2024, 0, 3), this.store.weekStartsOn());
    return Array.from({ length: 7 }, (_, i) => weekdayLabel(addDays(start, i), this.store.locale(), 'narrow'));
  });

  private readonly marks = computed(() => {
    const map = new Map<string, { dots: string[]; count: number }>();
    const year = this.store.focusDate().getFullYear();
    for (const e of this.store.visibleEvents()) {
      const first = eventFirstDay(e);
      const span = Math.min(diffDays(first, eventLastDay(e)), 62);
      const color = this.store.colorOf(e.calendarId);
      for (let i = 0; i <= span; i++) {
        const day = addDays(first, i);
        if (day.getFullYear() !== year) continue;
        const key = dateKey(day);
        const entry = map.get(key) ?? { dots: [], count: 0 };
        entry.count++;
        if (entry.dots.length < 3 && !entry.dots.includes(color)) entry.dots.push(color);
        map.set(key, entry);
      }
    }
    return map;
  });

  protected readonly months = computed<YearMonth[]>(() => {
    const year = this.store.focusDate().getFullYear();
    const today = this.store.today();
    const locale = this.store.locale();
    const marks = this.marks();

    return Array.from({ length: 12 }, (_, m) => {
      const date = new Date(year, m, 1);
      const weeks = monthMatrix(date, this.store.weekStartsOn()).map((week) =>
        week.map((d) => {
          if (!isSameMonth(d, date)) return null;
          const key = dateKey(d);
          const mark = marks.get(key);
          return {
            key,
            date: d,
            label: d.getDate(),
            today: isSameDay(d, today),
            dots: mark?.dots ?? [],
            count: mark?.count ?? 0,
          } satisfies YearDay;
        }),
      );
      return { key: `${year}-${m}`, date, name: monthLabel(date, locale), weeks };
    });
  });

  protected openMonth(date: Date): void {
    this.store.goToDate(date, 'month');
  }

  protected openDay(date: Date): void {
    this.store.goToDate(date, 'day');
  }
}
