import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CalendarEvent, EventDraft } from '../../models/calendar.models';
import { CalendarStore } from '../../services/calendar-store.service';
import {
  addDays,
  dateKey,
  diffDays,
  eventCoversDay,
  eventFirstDay,
  eventLastDay,
  formatTime,
  isMultiDay,
  isSameDay,
  isSameMonth,
  monthLabel,
  monthMatrix,
  startOfWeek,
  weekdayLabel,
  withMinutes,
} from '../../utils/date.utils';
import { layoutSpans } from '../../utils/layout.utils';
import { EventChipComponent } from '../event-chip/event-chip.component';

const HEAD_HEIGHT = 34;
const ROW_HEIGHT = 22;
const MIN_WEEK_HEIGHT = 104;
const DRAG_THRESHOLD_PX = 4;

interface MonthCell {
  key: string;
  date: Date;
  label: string;
  outside: boolean;
  today: boolean;
}

interface MonthChip {
  key: string;
  event: CalendarEvent;
  kind: 'bar' | 'line';
  color: string;
  left: string;
  width: string;
  top: number;
  time: string;
  cutStart: boolean;
  cutEnd: boolean;
}

interface MonthMore {
  key: string;
  date: Date;
  count: number;
  left: string;
  width: string;
  top: number;
}

interface MonthRow {
  key: string;
  cells: MonthCell[];
  chips: MonthChip[];
  mores: MonthMore[];
}

interface MonthDrag {
  event: CalendarEvent;
  anchor: Date;
  startX: number;
  startY: number;
  active: boolean;
}

/** Month grid: multi-day bars on top, timed events as lines, "+N more" when a cell is full, drag to reschedule. */
@Component({
  selector: 'cal-month-view',
  imports: [EventChipComponent],
  templateUrl: './month-view.component.html',
  styleUrl: './month-view.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonthViewComponent {
  protected readonly store = inject(CalendarStore);

  readonly eventClick = output<CalendarEvent>();
  readonly createRequest = output<EventDraft>();

  private readonly gridEl = viewChild.required<ElementRef<HTMLElement>>('gridEl');
  private readonly rowsEl = viewChild.required<ElementRef<HTMLElement>>('rowsEl');

  private readonly gridHeight = signal(640);
  private readonly preview = signal<{ id: string; start: Date; end: Date } | null>(null);
  protected readonly hoverKey = signal<string | null>(null);
  private drag: MonthDrag | null = null;

  private readonly matrix = computed(() => monthMatrix(this.store.focusDate(), this.store.weekStartsOn()));

  /** How many 22px lines fit in one week row. */
  private readonly capacity = computed(() => {
    const rowHeight = Math.max(this.gridHeight() / this.matrix().length, MIN_WEEK_HEIGHT);
    return Math.max(2, Math.floor((rowHeight - HEAD_HEIGHT - 6) / ROW_HEIGHT));
  });

  protected readonly weekdays = computed(() => {
    const start = startOfWeek(new Date(2024, 0, 3), this.store.weekStartsOn());
    return Array.from({ length: 7 }, (_, i) => weekdayLabel(addDays(start, i), this.store.locale(), 'short'));
  });

  private readonly displayEvents = computed(() => {
    const p = this.preview();
    const events = this.store.visibleEvents();
    return p ? events.map((e) => (e.id === p.id ? { ...e, start: p.start, end: p.end } : e)) : events;
  });

  protected readonly rows = computed<MonthRow[]>(() => {
    const focus = this.store.focusDate();
    const today = this.store.today();
    const locale = this.store.locale();
    const capacity = this.capacity();
    const events = this.displayEvents();

    return this.matrix().map((days) => {
      const first = days[0];
      const last = days[6];
      const inWeek = events.filter(
        (e) => eventFirstDay(e).getTime() <= last.getTime() && eventLastDay(e).getTime() >= first.getTime(),
      );
      const bars = inWeek.filter((e) => e.allDay || isMultiDay(e));
      const timed = inWeek.filter((e) => !(e.allDay || isMultiDay(e)));
      const { segments, laneCount } = layoutSpans(bars, days);

      const perDay = days.map((day) =>
        timed.filter((e) => eventCoversDay(e, day)).sort((a, b) => a.start.getTime() - b.start.getTime()),
      );
      const overflow = perDay.some((list) => laneCount + list.length > capacity);
      const slots = overflow ? capacity - 1 : capacity;

      const chips: MonthChip[] = [];
      const mores: MonthMore[] = [];

      for (const s of segments) {
        if (s.lane >= slots) continue;
        const padL = s.continuesBefore ? 0 : 3;
        const padR = s.continuesAfter ? 0 : 3;
        chips.push({
          key: `${s.event.id}@${dateKey(first)}`,
          event: s.event,
          kind: 'bar',
          color: this.store.colorOf(s.event.calendarId),
          left: `calc(${(s.startCol / 7) * 100}% + ${padL}px)`,
          width: `calc(${(s.span / 7) * 100}% - ${padL + padR}px)`,
          top: HEAD_HEIGHT + s.lane * ROW_HEIGHT,
          time: '',
          cutStart: s.continuesBefore,
          cutEnd: s.continuesAfter,
        });
      }

      days.forEach((day, col) => {
        const list = perDay[col];
        const room = Math.max(0, slots - laneCount);
        list.slice(0, room).forEach((e, i) => {
          chips.push({
            key: `${e.id}@${dateKey(day)}`,
            event: e,
            kind: 'line',
            color: this.store.colorOf(e.calendarId),
            left: `calc(${(col / 7) * 100}% + 3px)`,
            width: `calc(${100 / 7}% - 6px)`,
            top: HEAD_HEIGHT + (laneCount + i) * ROW_HEIGHT,
            time: formatTime(e.start),
            cutStart: false,
            cutEnd: false,
          });
        });

        const hiddenBars = segments.filter(
          (s) => s.lane >= slots && col >= s.startCol && col < s.startCol + s.span,
        ).length;
        const hidden = hiddenBars + Math.max(0, list.length - room);
        if (hidden > 0) {
          mores.push({
            key: `more@${dateKey(day)}`,
            date: day,
            count: hidden,
            left: `calc(${(col / 7) * 100}% + 3px)`,
            width: `calc(${100 / 7}% - 6px)`,
            top: HEAD_HEIGHT + slots * ROW_HEIGHT,
          });
        }
      });

      const cells: MonthCell[] = days.map((day) => ({
        key: dateKey(day),
        date: day,
        label: day.getDate() === 1 ? `${monthLabel(day, locale, 'short')} 1` : `${day.getDate()}`,
        outside: !isSameMonth(day, focus),
        today: isSameDay(day, today),
      }));

      return { key: dateKey(first), cells, chips, mores };
    });
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const el = this.gridEl().nativeElement;
      this.gridHeight.set(el.clientHeight);
      const observer = new ResizeObserver(() => this.gridHeight.set(el.clientHeight));
      observer.observe(el);
      destroyRef.onDestroy(() => observer.disconnect());
    });
    destroyRef.onDestroy(() => this.endDrag());
  }

  protected openDay(date: Date, ev: Event): void {
    ev.stopPropagation();
    this.store.goToDate(date, 'day');
  }

  protected createAt(date: Date): void {
    this.createRequest.emit({
      start: withMinutes(date, 9 * 60),
      end: withMinutes(date, 10 * 60),
      allDay: false,
    });
  }

  protected isDragging(id: string): boolean {
    return this.preview()?.id === id;
  }

  /* ------------------------------ drag to reschedule ------------------------------ */

  protected onChipPointerDown(ev: PointerEvent, chip: MonthChip): void {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    this.endDrag();
    const anchor = this.dateAt(ev);
    if (!anchor) return;
    this.drag = { event: chip.event, anchor, startX: ev.clientX, startY: ev.clientY, active: false };
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerCancel);
  }

  private endDrag(): void {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerCancel);
    document.body.classList.remove('cal-dragging');
    this.drag = null;
    this.preview.set(null);
    this.hoverKey.set(null);
  }

  private readonly onPointerMove = (ev: PointerEvent): void => {
    const d = this.drag;
    if (!d) return;
    if (!d.active) {
      if (Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) < DRAG_THRESHOLD_PX) return;
      d.active = true;
      document.body.classList.add('cal-dragging');
    }
    const target = this.dateAt(ev);
    if (!target) return;
    const delta = diffDays(d.anchor, target);
    this.hoverKey.set(dateKey(target));
    this.preview.set({
      id: d.event.id,
      start: addDays(d.event.start, delta),
      end: addDays(d.event.end, delta),
    });
  };

  private readonly onPointerUp = (): void => {
    const d = this.drag;
    if (!d) return;
    const preview = this.preview();
    this.endDrag();
    if (!d.active || !preview) {
      this.eventClick.emit(d.event);
      return;
    }
    if (preview.start.getTime() !== d.event.start.getTime()) {
      this.store.updateEvent({ ...d.event, start: preview.start, end: preview.end });
    }
  };

  private readonly onPointerCancel = (): void => this.endDrag();

  /** Which day is under the pointer, from the geometry of the rows container (chips overlay the cells). */
  private dateAt(ev: PointerEvent): Date | null {
    const rect = this.rowsEl().nativeElement.getBoundingClientRect();
    const rows = this.matrix();
    const x = Math.min(Math.max(ev.clientX - rect.left, 0), rect.width - 1);
    const y = Math.min(Math.max(ev.clientY - rect.top, 0), rect.height - 1);
    const row = Math.floor(y / (rect.height / rows.length));
    const col = Math.floor(x / (rect.width / 7));
    return rows[row]?.[col] ?? null;
  }
}
