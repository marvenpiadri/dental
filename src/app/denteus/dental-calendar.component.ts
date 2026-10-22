import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CalendarSidebarComponent } from '../calendar/components/calendar-sidebar/calendar-sidebar.component';
import { CalendarToolbarComponent } from '../calendar/components/calendar-toolbar/calendar-toolbar.component';
import { MonthViewComponent } from '../calendar/components/month-view/month-view.component';
import { TimeGridViewComponent } from '../calendar/components/time-grid-view/time-grid-view.component';
import { ToastStackComponent } from '../calendar/components/toast-stack/toast-stack.component';
import { YearViewComponent } from '../calendar/components/year-view/year-view.component';
import { CalendarEvent, CalendarTheme, CalendarViewType, CommitResult, EventDraft } from '../calendar/models/calendar.models';
import { CalendarStore } from '../calendar/services/calendar-store.service';
import { isSameDay } from '../calendar/utils/date.utils';
import { AppointmentEditorComponent, EditorProblem } from './components/appointment-editor/appointment-editor.component';
import { AppointmentPanelComponent } from './components/appointment-panel/appointment-panel.component';
import { WaitingRoomComponent } from './components/waiting-room/waiting-room.component';
import { ApiResult, Appointment, AppointmentDraft, AppointmentStatus } from './models/dental.models';
import { DentalStore } from './services/dental-store.service';
import { GroupBy, toCalendarEvent } from './utils/appointment-mapper';

interface EditorState {
  mode: 'create' | 'edit';
  draft: AppointmentDraft;
  problem: EditorProblem | null;
  saving: boolean;
}

const THEME_KEY = 'denteus-calendar-theme';

/**
 * The Denteus appointment calendar: the generic calendar views, wired to patients, dentists and chairs.
 *
 * Data comes from the application-scoped DentalStore. The calendar draws appointments and delegates
 * changes to the store; clinical records remain a separate workflow.
 */
@Component({
  selector: 'den-calendar',
  imports: [
    CalendarSidebarComponent,
    CalendarToolbarComponent,
    TimeGridViewComponent,
    MonthViewComponent,
    YearViewComponent,
    ToastStackComponent,
    AppointmentEditorComponent,
    AppointmentPanelComponent,
    WaitingRoomComponent,
  ],
  providers: [CalendarStore],
  templateUrl: './dental-calendar.component.html',
  styleUrl: './dental-calendar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-theme]': 'cal.theme()',
    '(document:keydown)': 'onKeydown($event)',
  },
})
export class DentalCalendarComponent implements OnInit {
  protected readonly cal = inject(CalendarStore);
  protected readonly dental = inject(DentalStore);

  readonly defaultView = input<CalendarViewType>('day');
  readonly openPatient = output<string>();
  readonly openEncounter = output<string>();
  readonly themeChange = output<CalendarTheme>();

  protected readonly groupBy = signal<GroupBy>('chair');
  protected readonly showCancelled = signal(false);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly editor = signal<EditorState | null>(null);
  protected readonly sidebarOpen = signal(false);

  protected readonly selected = computed(() => this.dental.appointments().find((a) => a.id === this.selectedId()) ?? null);

  protected readonly waiting = computed(() => {
    const today = this.cal.today();
    return this.dental.appointments()
      .filter((a) => a.status === 'arrived' && isSameDay(a.start, today))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  });

  protected readonly inTreatment = computed(() => {
    const today = this.cal.today();
    return this.dental.appointments().filter((a) => a.status === 'in-progress' && isSameDay(a.start, today)).length;
  });

  constructor() {
    effect(() => {
      const ctx = {
        patients: this.dental.patientMap(),
        dentists: this.dental.dentistMap(),
        chairs: this.dental.chairMap(),
        groupBy: this.groupBy(),
      };
      const showCancelled = this.showCancelled();
      this.cal.events.set(this.dental.appointments()
        .filter((a) => showCancelled || a.status !== 'cancelled')
        .map((a) => toCalendarEvent(a, ctx)));
    });

    effect(() => {
      if (this.groupBy() === 'chair') {
        this.cal.lanes.set({ dimension: 'chair', lanes: this.dental.chairs().map((c) => ({ id: c.id, label: c.name })) });
      } else {
        const visible = new Set(this.cal.categories().filter((c) => c.visible).map((c) => c.id));
        this.cal.lanes.set({
          dimension: 'dentist',
          lanes: this.dental.dentists().filter((d) => visible.has(d.id)).map((d) => ({ id: d.id, label: d.name, sublabel: d.specialty })),
        });
      }
    });
  }

  ngOnInit(): void {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      await this.dental.init();
      this.cal.categories.set(this.dental.dentists().map((d) => ({ id: d.id, name: d.name, color: d.color, visible: true })));
    } catch {
      this.cal.notify('The clinic database could not be opened. Appointment changes may not be saved.');
    }

    this.cal.view.set(this.defaultView());
    this.cal.showAllDay.set(false);

    this.cal.gateway.set({
      update: async (event: CalendarEvent): Promise<CommitResult> => {
        const result = await this.dental.reschedule(event.id, {
          start: event.start,
          end: event.end,
          dentistId: event.resources?.['dentist'],
          chairId: event.resources?.['chair'],
        });
        return result.ok ? { ok: true } : { ok: false, code: result.code, message: result.message, details: result.details };
      },
    });

    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_KEY);
    } catch {
      /* storage blocked: fall back to the system preference */
    }
    const system = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
    this.cal.theme.set(stored === 'dark' || stored === 'light' ? stored : system ? 'dark' : 'light');
    this.themeChange.emit(this.cal.theme());
  }

  protected openCreate(draft?: EventDraft): void {
    const store = this.dental;
    const visible = this.cal.categories().filter((c) => c.visible).map((c) => c.id);
    const start = draft?.start ?? this.defaultStart();
    const minutes = draft ? Math.max(15, Math.round((draft.end.getTime() - start.getTime()) / 60_000)) : 30;
    this.editor.set({
      mode: 'create',
      problem: null,
      saving: false,
      draft: {
        patientId: null,
        dentistId: draft?.resources?.['dentist'] ?? visible[0] ?? store.dentists()[0]?.id ?? '',
        chairId: draft?.resources?.['chair'] ?? store.chairs()[0]?.id ?? '',
        type: 'consultation',
        status: 'scheduled',
        start,
        durationMin: minutes === 60 ? 30 : minutes,
        reason: '',
        note: '',
      },
    });
  }

  private defaultStart(): Date {
    const focus = this.cal.focusDate();
    const now = this.cal.now();
    const slot = isSameDay(focus, now) ? (Math.floor((now.getHours() * 60 + now.getMinutes()) / 15) + 1) * 15 : 9 * 60;
    const d = new Date(focus);
    d.setHours(0, Math.min(slot, 23 * 60), 0, 0);
    return d;
  }

  protected openEdit(a: Appointment): void {
    this.editor.set({
      mode: 'edit',
      problem: null,
      saving: false,
      draft: {
        id: a.id,
        patientId: a.patientId,
        dentistId: a.dentistId,
        chairId: a.chairId,
        type: a.type,
        status: a.status,
        start: a.start,
        durationMin: Math.round((a.end.getTime() - a.start.getTime()) / 60_000),
        reason: a.reason ?? '',
        note: a.note ?? '',
      },
    });
  }

  protected async onSave(draft: AppointmentDraft): Promise<void> {
    const state = this.editor();
    if (!state) return;
    this.editor.set({ ...state, saving: true, problem: null });
    let result: ApiResult<Appointment>;
    try {
      result = draft.id ? await this.dental.updateAppointment(draft.id, draft) : await this.dental.createAppointment(draft);
    } catch {
      result = { ok: false, code: 'invalid', message: 'Could not reach the server.', details: ['Your changes were not saved. Try again.'] };
    }
    if (!result.ok) {
      this.editor.set({
        ...state,
        saving: false,
        problem: {
          title: result.code === 'conflict' ? "This time isn't available" : "Couldn't save the appointment",
          details: result.details,
        },
      });
      return;
    }
    this.editor.set(null);
    this.selectedId.set(result.value.id);
    if (!isSameDay(result.value.start, this.cal.focusDate()) && this.cal.view() === 'day') this.cal.goToDate(result.value.start);
    if (!this.cal.categories().find((c) => c.id === result.value.dentistId)?.visible) this.cal.toggleCategory(result.value.dentistId);
  }

  protected async onTransition(id: string, to: AppointmentStatus): Promise<void> {
    const result = await this.dental.transition(id, to);
    if (!result.ok) this.cal.notify(result.message);
  }

  protected toggleTheme(): void {
    const next: CalendarTheme = this.cal.theme() === 'dark' ? 'light' : 'dark';
    this.cal.theme.set(next);
    this.themeChange.emit(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
  }

  protected openFromWaiting(id: string): void {
    const a = this.dental.appointments().find((x) => x.id === id);
    if (a) this.cal.goToDate(a.start);
    this.selectedId.set(id);
  }

  protected onKeydown(ev: KeyboardEvent): void {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const target = ev.target as HTMLElement | null;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    if (ev.key === 'Escape') {
      if (this.editor()) return;
      this.selectedId.set(null);
      return;
    }
    if (this.editor()) return;
    const views: Record<string, CalendarViewType> = { d: 'day', w: 'week', m: 'month', y: 'year' };
    const key = ev.key.toLowerCase();
    if (views[key]) this.cal.setView(views[key]);
    else if (key === 't') this.cal.goToday();
    else if (key === 'n') this.openCreate();
    else if (ev.key === 'ArrowLeft') this.cal.prev();
    else if (ev.key === 'ArrowRight') this.cal.next();
    else return;
    ev.preventDefault();
  }
}
