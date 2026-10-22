import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CalendarEvent, CalendarLane, EventDraft, EventTone } from '../../models/calendar.models';
import { CalendarStore } from '../../services/calendar-store.service';
import {
  addDays,
  addMinutes,
  dateKey,
  eachDay,
  eventCoversDay,
  formatTime,
  isSameDay,
  minutesOfDay,
  pad2,
  weekdayLabel,
  withMinutes,
} from '../../utils/date.utils';
import { layoutDayColumns, layoutSpans, toDaySegment } from '../../utils/layout.utils';
import type { IconName } from '../cal-icon/cal-icon.component';
import { EventBlockComponent } from '../event-block/event-block.component';
import { EventChipComponent } from '../event-chip/event-chip.component';

const HOUR_HEIGHT = 64;
const SNAP_MIN = 15;
const MIN_DURATION = 15;
const DRAG_THRESHOLD_PX = 4;
const LANE_HEIGHT = 24;
const LANE_GAP = 2;

interface Slot {
  key: string;
  day: Date;
  lane: CalendarLane | null;
}

interface GridItem {
  key: string;
  event: CalendarEvent;
  color: string;
  top: number;
  height: number;
  left: string;
  width: string;
  time: string;
  subtitle: string;
  badge: { icon: IconName; label: string } | null;
  tone: EventTone;
  compact: boolean;
  showTopHandle: boolean;
  showBottomHandle: boolean;
  cutStart: boolean;
  cutEnd: boolean;
}

interface GridColumn {
  key: string;
  day: Date;
  today: boolean;
  dow: string;
  date: number;
  label: string;
  sublabel: string;
  items: GridItem[];
}

interface AllDayItem {
  key: string;
  event: CalendarEvent;
  color: string;
  left: string;
  width: string;
  top: number;
  cutStart: boolean;
  cutEnd: boolean;
}

type DragKind = 'move' | 'resize-start' | 'resize-end';

interface MoveDrag {
  kind: DragKind;
  event: CalendarEvent;
  anchorDay: number;
  anchorMin: number;
  startX: number;
  startY: number;
  active: boolean;
  locked: boolean;
}

interface CreateDrag {
  kind: 'create';
  dayIndex: number;
  anchorMin: number;
  startX: number;
  startY: number;
  active: boolean;
}

interface AllDayDrag {
  kind: 'allday';
  event: CalendarEvent;
  anchorCol: number;
  startX: number;
  startY: number;
  active: boolean;
}

type DragState = MoveDrag | CreateDrag | AllDayDrag;

interface Preview {
  id: string;
  start: Date;
  end: Date;
  resources?: Record<string, string>;
}

const snap = (minutes: number) => Math.round(minutes / SNAP_MIN) * SNAP_MIN;
const floorSnap = (minutes: number) => Math.floor(minutes / SNAP_MIN) * SNAP_MIN;

/**
 * Day and week views: all-day row + scrollable hour grid with drag, resize and drag-to-create.
 * In the day view the columns can be resource lanes (chairs, dentists...) when `store.lanes()` is set.
 */
@Component({
  selector: 'cal-time-grid-view',
  imports: [EventBlockComponent, EventChipComponent],
  templateUrl: './time-grid-view.component.html',
  styleUrl: './time-grid-view.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimeGridViewComponent {
  protected readonly store = inject(CalendarStore);

  readonly mode = input<'day' | 'week'>('week');
  readonly eventClick = output<CalendarEvent>();
  readonly createRequest = output<EventDraft>();

  protected readonly hourHeight = HOUR_HEIGHT;
  private readonly pxPerMin = HOUR_HEIGHT / 60;

  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');
  private readonly sticky = viewChild.required<ElementRef<HTMLElement>>('sticky');
  private readonly cols = viewChild.required<ElementRef<HTMLElement>>('cols');
  private readonly alldayEl = viewChild<ElementRef<HTMLElement>>('allday');

  /** Live position of the event being dragged / resized (null when idle). */
  private readonly preview = signal<Preview | null>(null);
  protected readonly ghost = signal<{ dayIndex: number; startMin: number; endMin: number } | null>(null);

  private drag: DragState | null = null;

  protected readonly lanesMode = computed(() => this.mode() === 'day' && !!this.store.lanes());
  private readonly laneDimension = computed(() => this.store.lanes()?.dimension ?? '');

  protected readonly days = computed(() =>
    this.mode() === 'day' ? [this.store.focusDate()] : eachDay(this.store.weekStart(), 7),
  );

  /** One entry per column: a day in the week view, a lane in a lane-based day view. */
  protected readonly slots = computed<Slot[]>(() => {
    const lanes = this.store.lanes();
    if (this.lanesMode() && lanes) {
      const day = this.store.focusDate();
      return lanes.lanes.map((lane) => ({ key: lane.id, day, lane }));
    }
    return this.days().map((day) => ({ key: dateKey(day), day, lane: null }));
  });

  private readonly displayEvents = computed(() => {
    const p = this.preview();
    const events = this.store.visibleEvents();
    return p
      ? events.map((e) => (e.id === p.id ? { ...e, start: p.start, end: p.end, resources: p.resources ?? e.resources } : e))
      : events;
  });

  protected readonly columns = computed<GridColumn[]>(() => {
    const events = this.displayEvents().filter((e) => !e.allDay);
    const locale = this.store.locale();
    const today = this.store.today();
    const dim = this.laneDimension();
    return this.slots().map((slot) => {
      const day = slot.day;
      const segments = events
        .filter((e) => eventCoversDay(e, day) && (!slot.lane || e.resources?.[dim] === slot.lane.id))
        .map((e) => toDaySegment(e, day));
      const items: GridItem[] = layoutDayColumns(segments).map((s) => {
        const height = Math.max((s.visEnd - s.startMin) * this.pxPerMin - 2, 18);
        return {
          key: `${s.event.id}@${slot.key}`,
          event: s.event,
          color: this.store.colorOf(s.event.calendarId),
          top: s.startMin * this.pxPerMin + 1,
          height,
          left: `calc(${(s.col / s.cols) * 100}% + 2px)`,
          width: `calc(${100 / s.cols}% - 5px)`,
          time: `${formatTime(s.event.start)} - ${formatTime(s.event.end)}`,
          subtitle: s.event.subtitle ?? s.event.location ?? '',
          badge: s.event.badge ?? null,
          tone: s.event.tone ?? 'normal',
          compact: height < 50,
          showTopHandle: !s.continuesBefore && !s.event.locked,
          showBottomHandle: !s.continuesAfter && !s.event.locked,
          cutStart: s.continuesBefore,
          cutEnd: s.continuesAfter,
        };
      });
      return {
        key: slot.key,
        day,
        today: isSameDay(day, today),
        dow: weekdayLabel(day, locale, 'short'),
        date: day.getDate(),
        label: slot.lane?.label ?? '',
        sublabel: slot.lane?.sublabel ?? '',
        items,
      };
    });
  });

  private readonly allDayLayout = computed(() =>
    layoutSpans(
      this.displayEvents().filter((e) => e.allDay),
      this.days(),
    ),
  );

  protected readonly allDayItems = computed<AllDayItem[]>(() => {
    const n = this.days().length;
    return this.allDayLayout().segments.map((s) => {
      const padL = s.continuesBefore ? 0 : 4;
      const padR = s.continuesAfter ? 0 : 4;
      return {
        key: `${s.event.id}@allday`,
        event: s.event,
        color: this.store.colorOf(s.event.calendarId),
        left: `calc(${(s.startCol / n) * 100}% + ${padL}px)`,
        width: `calc(${(s.span / n) * 100}% - ${padL + padR}px)`,
        top: 4 + s.lane * (LANE_HEIGHT + LANE_GAP),
        cutStart: s.continuesBefore,
        cutEnd: s.continuesAfter,
      };
    });
  });

  protected readonly allDayHeight = computed(
    () => Math.max(this.allDayLayout().laneCount, 1) * (LANE_HEIGHT + LANE_GAP) + 8,
  );

  protected readonly hours = Array.from({ length: 24 }, (_, h) => ({ h, label: `${pad2(h)}:00`, top: h * HOUR_HEIGHT }));

  protected readonly todayIndex = computed(() => this.slots().findIndex((s) => isSameDay(s.day, this.store.today())));
  protected readonly nowTop = computed(() => minutesOfDay(this.store.now()) * this.pxPerMin);
  protected readonly nowLabel = computed(() => formatTime(this.store.now()));

  /** The bold part of the now-line: the whole width in a lane view, otherwise today's column. */
  protected readonly nowBox = computed(() => {
    const n = this.slots().length;
    if (this.lanesMode()) return { left: 0, width: 100 };
    return { left: (this.todayIndex() / n) * 100, width: 100 / n };
  });

  protected readonly ghostLabel = computed(() => {
    const g = this.ghost();
    if (!g) return '';
    const day = this.slots()[g.dayIndex]?.day ?? this.store.focusDate();
    return `${formatTime(withMinutes(day, g.startMin))} - ${formatTime(withMinutes(day, g.endMin))}`;
  });

  constructor() {
    afterNextRender(() => this.scrollToInitialPosition());
    inject(DestroyRef).onDestroy(() => this.endDrag());
  }

  protected hourLabelHidden(top: number): boolean {
    if (top === 0) return true;
    return this.todayIndex() >= 0 && Math.abs(top - this.nowTop()) < 14;
  }

  protected openDay(day: Date): void {
    if (this.mode() === 'week') this.store.goToDate(day, 'day');
  }

  protected createAllDay(day: Date): void {
    this.createRequest.emit({ start: day, end: addDays(day, 1), allDay: true });
  }

  /* ------------------------------------------------------------------ */
  /* Pointer interaction                                                 */
  /* ------------------------------------------------------------------ */

  protected onColsPointerDown(ev: PointerEvent): void {
    if (ev.button !== 0) return;
    if ((ev.target as HTMLElement).closest('cal-event-block')) return;
    const p = this.gridPoint(ev);
    this.beginDrag({
      kind: 'create',
      dayIndex: p.dayIndex,
      anchorMin: p.min,
      startX: ev.clientX,
      startY: ev.clientY,
      active: false,
    });
  }

  protected onItemPointerDown(ev: PointerEvent, item: GridItem, kind: DragKind): void {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    const p = this.gridPoint(ev);
    this.beginDrag({
      kind,
      event: item.event,
      anchorDay: p.dayIndex,
      anchorMin: p.min,
      startX: ev.clientX,
      startY: ev.clientY,
      active: false,
      locked: item.event.locked === true,
    });
  }

  protected onAllDayPointerDown(ev: PointerEvent, item: AllDayItem): void {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    this.beginDrag({
      kind: 'allday',
      event: item.event,
      anchorCol: this.allDayColumn(ev),
      startX: ev.clientX,
      startY: ev.clientY,
      active: false,
    });
  }

  protected isDragging(id: string): boolean {
    return this.preview()?.id === id;
  }

  private beginDrag(state: DragState): void {
    this.endDrag();
    this.drag = state;
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
    this.ghost.set(null);
  }

  private readonly onPointerMove = (ev: PointerEvent): void => {
    const d = this.drag;
    if (!d) return;
    const moved = Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY);

    // locked events can be clicked but never dragged: explain once and ignore the movement
    if (d.kind !== 'create' && d.kind !== 'allday' && d.locked) {
      if (!d.active && moved >= DRAG_THRESHOLD_PX) {
        d.active = true;
        this.store.notify(d.event.lockedReason ?? "This event can't be moved.", 'info');
      }
      return;
    }

    if (!d.active) {
      if (moved < DRAG_THRESHOLD_PX) return;
      d.active = true;
      document.body.classList.add('cal-dragging');
    }

    if (d.kind === 'allday') {
      const delta = this.allDayColumn(ev) - d.anchorCol;
      this.preview.set({
        id: d.event.id,
        start: addDays(d.event.start, delta),
        end: addDays(d.event.end, delta),
      });
      return;
    }

    const p = this.gridPoint(ev);

    switch (d.kind) {
      case 'move': {
        const deltaMin = snap(p.min - d.anchorMin);
        const slot = this.slots()[p.dayIndex];
        const deltaDays = slot.lane ? 0 : p.dayIndex - d.anchorDay;
        const resources = slot.lane ? { ...(d.event.resources ?? {}), [this.laneDimension()]: slot.lane.id } : undefined;
        this.preview.set({
          id: d.event.id,
          start: addMinutes(addDays(d.event.start, deltaDays), deltaMin),
          end: addMinutes(addDays(d.event.end, deltaDays), deltaMin),
          resources,
        });
        break;
      }
      case 'resize-end': {
        let end = addMinutes(d.event.end, snap(p.min - d.anchorMin));
        const minEnd = addMinutes(d.event.start, MIN_DURATION);
        if (end < minEnd) end = minEnd;
        this.preview.set({ id: d.event.id, start: d.event.start, end });
        break;
      }
      case 'resize-start': {
        let start = addMinutes(d.event.start, snap(p.min - d.anchorMin));
        const maxStart = addMinutes(d.event.end, -MIN_DURATION);
        if (start > maxStart) start = maxStart;
        this.preview.set({ id: d.event.id, start, end: d.event.end });
        break;
      }
      case 'create': {
        const a = floorSnap(d.anchorMin);
        const c = floorSnap(Math.min(p.min, 1439));
        this.ghost.set({
          dayIndex: d.dayIndex,
          startMin: Math.min(a, c),
          endMin: Math.min(Math.max(a, c) + SNAP_MIN, 1440),
        });
        break;
      }
    }
  };

  private readonly onPointerUp = (): void => {
    const d = this.drag;
    if (!d) return;
    const preview = this.preview();
    const ghost = this.ghost();
    this.endDrag();

    if (d.kind === 'create') {
      const slot = this.slots()[ghost && d.active ? ghost.dayIndex : d.dayIndex];
      if (!slot) return;
      const resources = slot.lane ? { [this.laneDimension()]: slot.lane.id } : undefined;
      if (ghost && d.active) {
        this.createRequest.emit({
          start: withMinutes(slot.day, ghost.startMin),
          end: withMinutes(slot.day, ghost.endMin),
          allDay: false,
          resources,
        });
      } else {
        const start = Math.floor(d.anchorMin / 30) * 30;
        this.createRequest.emit({
          start: withMinutes(slot.day, start),
          end: withMinutes(slot.day, start + 60),
          allDay: false,
          resources,
        });
      }
      return;
    }

    if (!d.active) {
      this.eventClick.emit(d.event);
      return;
    }
    if (!preview) return;

    const next: CalendarEvent = {
      ...d.event,
      start: preview.start,
      end: preview.end,
      resources: preview.resources ?? d.event.resources,
    };
    const unchanged =
      next.start.getTime() === d.event.start.getTime() &&
      next.end.getTime() === d.event.end.getTime() &&
      JSON.stringify(next.resources ?? {}) === JSON.stringify(d.event.resources ?? {});
    if (!unchanged) void this.store.commitUpdate(next);
  };

  private readonly onPointerCancel = (): void => this.endDrag();

  private gridPoint(ev: PointerEvent): { dayIndex: number; min: number } {
    const rect = this.cols().nativeElement.getBoundingClientRect();
    const n = this.slots().length;
    const x = Math.min(Math.max(ev.clientX - rect.left, 0), rect.width - 1);
    const dayIndex = Math.floor(x / (rect.width / n));
    const min = Math.min(Math.max((ev.clientY - rect.top) / this.pxPerMin, 0), 1440);
    return { dayIndex, min };
  }

  private allDayColumn(ev: PointerEvent): number {
    const el = this.alldayEl()?.nativeElement;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const n = this.days().length;
    const x = Math.min(Math.max(ev.clientX - rect.left, 0), rect.width - 1);
    return Math.floor(x / (rect.width / n));
  }

  /* ------------------------------------------------------------------ */

  private scrollToInitialPosition(): void {
    const el = this.scroller().nativeElement;
    const stickyHeight = this.sticky().nativeElement.offsetHeight;
    const visibleMin = Math.max((el.clientHeight - stickyHeight) / this.pxPerMin, 60);
    let startMin = 7 * 60;
    const nowMin = minutesOfDay(this.store.now());
    if (this.todayIndex() >= 0 && nowMin > startMin + visibleMin - 60) {
      startMin = Math.max(0, nowMin - visibleMin * 0.6);
    }
    startMin = Math.max(0, Math.min(startMin, 1440 - visibleMin));
    el.scrollTop = startMin * this.pxPerMin;
  }
}
