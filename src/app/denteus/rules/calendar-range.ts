import type { CalendarViewType } from '../../calendar/models/calendar.models';
import { addDays, startOfDay, startOfWeek } from '../../calendar/utils/date.utils';

/** The dates a calendar view shows, as [from, to): what the server is asked for, so a screen never loads more than it displays. */
export function visibleRange(view: CalendarViewType, focus: Date, weekStartsOn: 0 | 1): { from: Date; to: Date } {
  const day = startOfDay(focus);
  switch (view) {
    case 'day': return { from: day, to: addDays(day, 1) };
    case 'week': { const from = startOfWeek(day, weekStartsOn); return { from, to: addDays(from, 7) }; }
    case 'month': { const from = startOfWeek(new Date(day.getFullYear(), day.getMonth(), 1), weekStartsOn); return { from, to: addDays(from, 42) }; } // the grid shows six weeks
    case 'year': return { from: new Date(day.getFullYear(), 0, 1), to: new Date(day.getFullYear() + 1, 0, 1) };
  }
}
