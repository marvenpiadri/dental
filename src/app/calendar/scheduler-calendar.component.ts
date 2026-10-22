import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DEMO_CATEGORIES, createDemoEvents } from './data/demo-data';
import { CalendarCategory, CalendarEvent, CalendarTheme, CalendarViewType, EventDraft } from './models/calendar.models';
import { CalendarSidebarComponent } from './components/calendar-sidebar/calendar-sidebar.component';
import { CalendarToolbarComponent } from './components/calendar-toolbar/calendar-toolbar.component';
import { EventEditorComponent } from './components/event-editor/event-editor.component';
import { MonthViewComponent } from './components/month-view/month-view.component';
import { TimeGridViewComponent } from './components/time-grid-view/time-grid-view.component';
import { ToastStackComponent } from './components/toast-stack/toast-stack.component';
import { YearViewComponent } from './components/year-view/year-view.component';
import { CalendarStore } from './services/calendar-store.service';
import { addMinutes, startOfDay, withMinutes } from './utils/date.utils';

interface EditorState {
  mode: 'create' | 'edit';
  draft: CalendarEvent;
}

interface StoredState {
  v: 1;
  theme?: CalendarTheme;
  categories: CalendarCategory[];
  events: (Omit<CalendarEvent, 'start' | 'end'> & { start: string; end: string })[];
}

/**
 * Drop-in scheduling calendar: sidebar, day / week / month / year views, drag & drop, event editor.
 *
 * <cal-scheduler
 *   [initialEvents]="events"
 *   [initialCategories]="calendars"
 *   storageKey="my-app-calendar"
 *   (eventsChange)="save($event)" />
 *
 * Set the height from outside (the host is `display: block; height: 100%`).
 */
@Component({
  selector: 'cal-scheduler',
  imports: [
    CalendarSidebarComponent,
    CalendarToolbarComponent,
    TimeGridViewComponent,
    MonthViewComponent,
    YearViewComponent,
    EventEditorComponent,
    ToastStackComponent,
  ],
  providers: [CalendarStore],
  templateUrl: './scheduler-calendar.component.html',
  styleUrl: './scheduler-calendar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-theme]': 'store.theme()',
    '(document:keydown)': 'onKeydown($event)',
  },
})
export class SchedulerCalendarComponent implements OnInit {
  protected readonly store = inject(CalendarStore);

  /** Events to show. When empty and `demoData` is true, sample data is generated. */
  readonly initialEvents = input<CalendarEvent[] | null>(null);
  readonly initialCategories = input<CalendarCategory[] | null>(null);
  readonly demoData = input(true);
  /** localStorage key used to persist events / theme. Pass null to disable persistence. */
  readonly storageKey = input<string | null>('cal-scheduler-v1');
  readonly defaultView = input<CalendarViewType>('week');
  readonly weekStartsOn = input<0 | 1>(1);
  readonly locale = input('en-US');
  readonly theme = input<CalendarTheme | 'auto'>('auto');

  readonly eventsChange = output<CalendarEvent[]>();
  readonly themeChange = output<CalendarTheme>();

  protected readonly editor = signal<EditorState | null>(null);
  protected readonly sidebarOpen = signal(false);

  private ready = false;

  constructor() {
    effect(() => {
      const events = this.store.events();
      const categories = this.store.categories();
      const theme = this.store.theme();
      if (!this.ready) return;
      this.persist(events, categories, theme);
      this.eventsChange.emit(events);
    });

    effect(() => {
      const theme = this.store.theme();
      if (this.ready) this.themeChange.emit(theme);
    });
  }

  ngOnInit(): void {
    const store = this.store;
    store.locale.set(this.locale());
    store.weekStartsOn.set(this.weekStartsOn());
    store.view.set(this.defaultView());

    const stored = this.load();
    const today = startOfDay(new Date());

    const categories =
      stored?.categories ?? this.initialCategories() ?? (this.demoData() ? DEMO_CATEGORIES : []);
    const events =
      stored?.events ?? this.initialEvents() ?? (this.demoData() ? createDemoEvents(today) : []);

    store.categories.set(categories.map((c) => ({ ...c })));
    store.events.set(events);

    const forced = this.theme();
    const system = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
    store.theme.set(forced !== 'auto' ? forced : (stored?.theme ?? (system ? 'dark' : 'light')));

    this.ready = true;
    this.themeChange.emit(store.theme());
  }

  /* ---------------------------------- editor ---------------------------------- */

  protected openCreate(draft?: EventDraft): void {
    const store = this.store;
    let start: Date;
    let end: Date;
    let allDay = false;
    if (draft) {
      ({ start, end, allDay } = draft);
    } else {
      const focus = store.focusDate();
      const now = store.now();
      const sameDay = focus.getTime() === store.today().getTime();
      const minutes = sameDay ? (Math.floor((now.getHours() * 60 + now.getMinutes()) / 30) + 1) * 30 : 9 * 60;
      start = withMinutes(focus, Math.min(minutes, 23 * 60));
      end = addMinutes(start, 60);
    }
    this.editor.set({
      mode: 'create',
      draft: {
        id: '',
        title: '',
        start,
        end,
        allDay,
        calendarId: store.categories().find((c) => c.visible)?.id ?? store.categories()[0]?.id ?? '',
      },
    });
  }

  protected openEdit(event: CalendarEvent): void {
    this.editor.set({ mode: 'edit', draft: event });
  }

  protected onSave(event: CalendarEvent): void {
    const state = this.editor();
    if (!state) return;
    if (state.mode === 'create') this.store.addEvent(event);
    else this.store.updateEvent(event);
    this.editor.set(null);
  }

  protected onRemove(id: string): void {
    this.store.removeEvent(id);
    this.editor.set(null);
  }

  protected toggleTheme(): void {
    this.store.theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  /* -------------------------------- shortcuts --------------------------------- */

  protected onKeydown(ev: KeyboardEvent): void {
    if (ev.metaKey || ev.ctrlKey || ev.altKey || this.editor()) return;
    const target = ev.target as HTMLElement | null;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;

    const views: Record<string, CalendarViewType> = { d: 'day', w: 'week', m: 'month', y: 'year' };
    const key = ev.key.toLowerCase();
    if (views[key]) this.store.setView(views[key]);
    else if (key === 't') this.store.goToday();
    else if (key === 'n') this.openCreate();
    else if (ev.key === 'ArrowLeft') this.store.prev();
    else if (ev.key === 'ArrowRight') this.store.next();
    else return;
    ev.preventDefault();
  }

  /* ------------------------------- persistence -------------------------------- */

  private persist(events: CalendarEvent[], categories: CalendarCategory[], theme: CalendarTheme): void {
    const key = this.storageKey();
    if (!key) return;
    try {
      const state: StoredState = {
        v: 1,
        theme,
        categories,
        events: events.map((e) => ({ ...e, start: e.start.toISOString(), end: e.end.toISOString() })),
      };
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* storage full or unavailable: the calendar keeps working in memory */
    }
  }

  private load(): { theme?: CalendarTheme; categories: CalendarCategory[]; events: CalendarEvent[] } | null {
    const key = this.storageKey();
    if (!key) return null;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredState;
      if (parsed.v !== 1 || !Array.isArray(parsed.events) || !Array.isArray(parsed.categories)) return null;
      return {
        theme: parsed.theme,
        categories: parsed.categories,
        events: parsed.events.map((e) => ({ ...e, start: new Date(e.start), end: new Date(e.end) })),
      };
    } catch {
      return null;
    }
  }
}
