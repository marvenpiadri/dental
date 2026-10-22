import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import {
  CalendarCategory,
  CalendarEvent,
  CalendarGateway,
  CalendarTheme,
  CalendarToast,
  CalendarViewType,
  CommitResult,
  LaneConfig,
} from '../models/calendar.models';
import {
  addDays,
  addMonths,
  monthLabel,
  newId,
  startOfDay,
  startOfWeek,
} from '../utils/date.utils';

/**
 * Single source of truth for one calendar instance.
 * It is provided by the scheduler component (not root) so several calendars can live side by side.
 */
@Injectable()
export class CalendarStore {
  readonly locale = signal('en-US');
  readonly weekStartsOn = signal<0 | 1>(1);
  readonly view = signal<CalendarViewType>('week');
  readonly focusDate = signal<Date>(startOfDay(new Date()));
  readonly theme = signal<CalendarTheme>('light');
  readonly search = signal('');

  readonly categories = signal<CalendarCategory[]>([]);
  readonly events = signal<CalendarEvent[]>([]);

  /** When set, the day view shows one column per lane (chair, dentist, room...) instead of one per day. */
  readonly lanes = signal<LaneConfig | null>(null);
  /** Hide the all-day strip for calendars that never use it (appointments). */
  readonly showAllDay = signal(true);
  /** When set, drags and resizes are confirmed by this gateway and rolled back if it refuses. */
  readonly gateway = signal<CalendarGateway | null>(null);
  readonly toasts = signal<CalendarToast[]>([]);
  private toastSeq = 0;

  /** Ticks every 30 s so "today" and the now-line stay correct. */
  readonly now = signal(new Date());
  readonly today = computed(() => startOfDay(this.now()));

  readonly categoryMap = computed(() => new Map(this.categories().map((c) => [c.id, c])));

  /** Events after sidebar toggles and the search box are applied. */
  readonly visibleEvents = computed(() => {
    const visible = new Set(this.categories().filter((c) => c.visible).map((c) => c.id));
    const q = this.search().trim().toLowerCase();
    return this.events().filter((e) => {
      if (!visible.has(e.calendarId)) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        (e.location ?? '').toLowerCase().includes(q) ||
        (e.notes ?? '').toLowerCase().includes(q)
      );
    });
  });

  readonly title = computed(() => {
    const d = this.focusDate();
    const locale = this.locale();
    switch (this.view()) {
      case 'day':
        return new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric', year: 'numeric' }).format(d);
      case 'year':
        return `${d.getFullYear()}`;
      default:
        return `${monthLabel(d, locale)} ${d.getFullYear()}`;
    }
  });

  /** First day of the week that contains the focus date. */
  readonly weekStart = computed(() => startOfWeek(this.focusDate(), this.weekStartsOn()));

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  /* ---------------------------- navigation ---------------------------- */

  setView(view: CalendarViewType): void {
    this.view.set(view);
  }

  goToDate(date: Date, view?: CalendarViewType): void {
    this.focusDate.set(startOfDay(date));
    if (view) this.view.set(view);
  }

  goToday(): void {
    this.focusDate.set(this.today());
  }

  next(): void {
    this.shift(1);
  }

  prev(): void {
    this.shift(-1);
  }

  private shift(dir: 1 | -1): void {
    const d = this.focusDate();
    switch (this.view()) {
      case 'day':
        this.focusDate.set(addDays(d, dir));
        break;
      case 'week':
        this.focusDate.set(addDays(d, 7 * dir));
        break;
      case 'month':
        this.focusDate.set(startOfDay(addMonths(d, dir)));
        break;
      case 'year':
        this.focusDate.set(startOfDay(addMonths(d, 12 * dir)));
        break;
    }
  }

  /* ----------------------------- calendars ---------------------------- */

  toggleCategory(id: string): void {
    this.categories.update((list) => list.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c)));
  }

  colorOf(calendarId: string): string {
    return this.categoryMap().get(calendarId)?.color ?? '#64748b';
  }

  /* ------------------------------- events ----------------------------- */

  addEvent(event: Omit<CalendarEvent, 'id'> & { id?: string }): CalendarEvent {
    const created: CalendarEvent = { ...event, id: event.id || newId() };
    this.events.update((list) => [...list, created]);
    return created;
  }

  updateEvent(event: CalendarEvent): void {
    this.events.update((list) => list.map((e) => (e.id === event.id ? event : e)));
  }

  removeEvent(id: string): void {
    this.events.update((list) => list.filter((e) => e.id !== id));
  }

  /**
   * Applies a drag / resize. With a gateway the change is shown immediately, confirmed by the
   * gateway, and rolled back with a message when refused. Without one it is simply applied.
   */
  async commitUpdate(event: CalendarEvent): Promise<CommitResult> {
    const previous = this.events().find((e) => e.id === event.id);
    if (!previous) return { ok: false, code: 'not-found', message: 'This event no longer exists.' };

    this.updateEvent(event);
    const gateway = this.gateway();
    if (!gateway) return { ok: true };

    let result: CommitResult;
    try {
      result = await gateway.update(event, previous);
    } catch {
      result = { ok: false, code: 'error', message: 'Could not reach the server. Nothing was changed.' };
    }
    if (!result.ok) {
      this.updateEvent(previous);
      this.notify(result.message);
    }
    return result;
  }

  /* -------------------------------- toasts -------------------------------- */

  notify(text: string, kind: 'error' | 'info' = 'error'): void {
    const id = ++this.toastSeq;
    this.toasts.update((list) => [...list, { id, kind, text }]);
    setTimeout(() => this.dismissToast(id), 7000);
  }

  dismissToast(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
