import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { CalendarStore } from '../../services/calendar-store.service';
import {
  addDays,
  addMonths,
  dateKey,
  formatDateInput,
  formatDateTimeInput,
  isSameDay,
  isSameMonth,
  monthLabel,
  monthMatrix,
  pad2,
  startOfMonth,
  startOfWeek,
  weekdayLabel,
} from '../../utils/date.utils';
import { CalIconComponent } from '../cal-icon/cal-icon.component';

interface PickerDay {
  key: string;
  date: Date;
  label: number;
  outside: boolean;
  selected: boolean;
  today: boolean;
}

/** "2026-02-11 08:00" field that opens a month + hour/minute picker. Two-way bound with [(value)]. */
@Component({
  selector: 'cal-datetime-field',
  imports: [CalIconComponent],
  templateUrl: './datetime-field.component.html',
  styleUrl: './datetime-field.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
    '(keydown.escape)': 'onEscape($event)',
  },
})
export class DateTimeFieldComponent {
  readonly value = model.required<Date>();
  readonly dateOnly = input(false);
  readonly label = input('Date');
  /** Which edge of the field the popover lines up with. */
  readonly align = input<'left' | 'right'>('left');

  private readonly store = inject(CalendarStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly open = signal(false);
  protected readonly openUp = signal(false);
  private readonly cursor = signal(startOfMonth(new Date()));

  protected readonly display = computed(() =>
    this.dateOnly() ? formatDateInput(this.value()) : formatDateTimeInput(this.value()),
  );

  protected readonly cursorTitle = computed(() => {
    const c = this.cursor();
    return `${monthLabel(c, this.store.locale(), 'short')} ${c.getFullYear()}`;
  });

  protected readonly weekdays = computed(() => {
    const start = startOfWeek(new Date(2024, 0, 3), this.store.weekStartsOn());
    return Array.from({ length: 7 }, (_, i) => weekdayLabel(addDays(start, i), this.store.locale(), 'narrow'));
  });

  protected readonly weeks = computed<PickerDay[][]>(() => {
    const cursor = this.cursor();
    const value = this.value();
    const today = this.store.today();
    return monthMatrix(cursor, this.store.weekStartsOn()).map((week) =>
      week.map((date) => ({
        key: dateKey(date),
        date,
        label: date.getDate(),
        outside: !isSameMonth(date, cursor),
        selected: isSameDay(date, value),
        today: isSameDay(date, today),
      })),
    );
  });

  protected readonly hours = Array.from({ length: 24 }, (_, h) => h);

  protected readonly minutes = computed(() => {
    const set = new Set<number>(Array.from({ length: 12 }, (_, i) => i * 5));
    set.add(this.value().getMinutes());
    return [...set].sort((a, b) => a - b);
  });

  protected readonly timeLabel = computed(() => `${pad2(this.value().getHours())}:${pad2(this.value().getMinutes())}`);

  protected pad = pad2;

  protected toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }
    this.cursor.set(startOfMonth(this.value()));
    const rect = this.host.nativeElement.getBoundingClientRect();
    const room = this.dateOnly() ? 330 : 350;
    this.openUp.set(window.innerHeight - rect.bottom < room && rect.top > window.innerHeight - rect.bottom);
    this.open.set(true);
    afterNextRender(() => this.scrollSelectedIntoView(), { injector: this.injector });
  }

  protected close(): void {
    this.open.set(false);
  }

  protected shiftMonth(delta: number): void {
    this.cursor.set(addMonths(this.cursor(), delta));
  }

  protected pickDay(date: Date): void {
    const v = this.value();
    this.value.set(new Date(date.getFullYear(), date.getMonth(), date.getDate(), v.getHours(), v.getMinutes()));
    if (this.dateOnly()) this.close();
  }

  protected pickHour(h: number): void {
    const v = this.value();
    this.value.set(new Date(v.getFullYear(), v.getMonth(), v.getDate(), h, v.getMinutes()));
  }

  protected pickMinute(m: number): void {
    const v = this.value();
    this.value.set(new Date(v.getFullYear(), v.getMonth(), v.getDate(), v.getHours(), m));
  }

  protected onDocumentPointerDown(ev: Event): void {
    if (this.open() && !this.host.nativeElement.contains(ev.target as Node)) this.close();
  }

  protected onEscape(ev: Event): void {
    if (!this.open()) return;
    ev.stopPropagation();
    this.close();
  }

  private scrollSelectedIntoView(): void {
    this.host.nativeElement.querySelectorAll<HTMLElement>('.col').forEach((col) => {
      const sel = col.querySelector<HTMLElement>('.sel');
      if (sel) col.scrollTop = sel.offsetTop - col.clientHeight / 2 + sel.offsetHeight / 2;
    });
  }
}
