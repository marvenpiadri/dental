import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CalendarEvent } from '../../models/calendar.models';
import { CalendarStore } from '../../services/calendar-store.service';
import { addDays, addMinutes, startOfDay, withMinutes } from '../../utils/date.utils';
import { CalIconComponent } from '../cal-icon/cal-icon.component';
import { DateTimeFieldComponent } from '../datetime-field/datetime-field.component';

/** Modal used both to create and to edit an event. Emits the finished event; the parent stores it. */
@Component({
  selector: 'cal-event-editor',
  imports: [CalIconComponent, DateTimeFieldComponent],
  templateUrl: './event-editor.component.html',
  styleUrl: './event-editor.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown.escape)': 'cancel.emit()' },
})
export class EventEditorComponent implements OnInit {
  readonly draft = input.required<CalendarEvent>();
  readonly mode = input<'create' | 'edit'>('create');

  readonly save = output<CalendarEvent>();
  readonly remove = output<string>();
  readonly cancel = output<void>();

  protected readonly store = inject(CalendarStore);
  private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');

  protected readonly title = signal('');
  protected readonly calendarId = signal('');
  protected readonly allDay = signal(false);
  /** For all-day events `end` is the LAST day (inclusive) while editing. */
  protected readonly start = signal(new Date());
  protected readonly end = signal(new Date());
  protected readonly location = signal('');
  protected readonly notes = signal('');
  protected readonly menuOpen = signal(false);

  protected readonly calendar = computed(() => this.store.categoryMap().get(this.calendarId()));

  constructor() {
    afterNextRender(() => {
      const input = this.titleInput()?.nativeElement;
      input?.focus();
      input?.select();
    });
  }

  ngOnInit(): void {
    const d = this.draft();
    this.title.set(d.title);
    this.calendarId.set(d.calendarId || this.store.categories()[0]?.id || '');
    this.allDay.set(d.allDay);
    this.start.set(new Date(d.start));
    this.end.set(d.allDay ? addDays(startOfDay(d.end), -1) : new Date(d.end));
    this.location.set(d.location ?? '');
    this.notes.set(d.notes ?? '');
  }

  protected onStartChange(next: Date): void {
    const prev = this.start();
    const delta = next.getTime() - prev.getTime();
    this.start.set(next);
    // keep the duration: moving the start drags the end along
    this.end.set(this.allDay() ? addDays(this.end(), Math.round(delta / 86_400_000)) : new Date(this.end().getTime() + delta));
  }

  protected onEndChange(next: Date): void {
    const start = this.start();
    if (this.allDay()) {
      this.end.set(next.getTime() < startOfDay(start).getTime() ? startOfDay(start) : next);
    } else {
      const min = addMinutes(start, 15);
      this.end.set(next.getTime() < min.getTime() ? min : next);
    }
  }

  protected setAllDay(on: boolean): void {
    if (on === this.allDay()) return;
    if (on) {
      this.start.set(startOfDay(this.start()));
      this.end.set(startOfDay(this.end()));
    } else {
      this.start.set(withMinutes(this.start(), 9 * 60));
      this.end.set(withMinutes(this.end(), 10 * 60));
    }
    this.allDay.set(on);
  }

  protected pickCalendar(id: string): void {
    this.calendarId.set(id);
    this.menuOpen.set(false);
  }

  protected onDialogPointerDown(ev: Event): void {
    if (this.menuOpen() && !(ev.target as HTMLElement).closest('.cal-picker')) this.menuOpen.set(false);
  }

  protected submit(): void {
    const allDay = this.allDay();
    const d = this.draft();
    this.save.emit({
      ...d,
      title: this.title().trim() || 'Untitled event',
      calendarId: this.calendarId(),
      allDay,
      start: allDay ? startOfDay(this.start()) : this.start(),
      end: allDay ? addDays(startOfDay(this.end()), 1) : this.end(),
      location: this.location().trim() || undefined,
      notes: this.notes().trim() || undefined,
    });
  }
}
