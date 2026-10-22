import type { IconName } from '../components/cal-icon/cal-icon.component';

export type CalendarViewType = 'day' | 'week' | 'month' | 'year';
export type CalendarTheme = 'light' | 'dark';

/** A calendar the user can toggle on/off in the sidebar (Work, Personal, a dentist, ...). */
export interface CalendarCategory {
  id: string;
  name: string;
  /** Base colour (hex). Backgrounds and text colours are derived from it in CSS. */
  color: string;
  visible: boolean;
}

/** How strongly an event is drawn. `muted` = cancelled-like, `done` = finished, the others call attention. */
export type EventTone = 'normal' | 'muted' | 'done' | 'attention' | 'active';

/**
 * A scheduled event.
 *
 * All-day events: `start` is 00:00 of the first day and `end` is 00:00 of the day
 * AFTER the last day (exclusive, like iCalendar).
 */
export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  calendarId: string;
  location?: string;
  notes?: string;
  /** Second line on the card (e.g. "Filling · Dr. Idrissi"). */
  subtitle?: string;
  /** Resources the event occupies, keyed by dimension (e.g. { dentist: 'd1', chair: 'c2' }). */
  resources?: Record<string, string>;
  /** Small status marker; always an icon plus a text label so it never relies on colour alone. */
  badge?: { icon: IconName; label: string };
  tone?: EventTone;
  /** Locked events can be opened but not dragged or resized. */
  locked?: boolean;
  lockedReason?: string;
}

/** One column of the day view when events are laid out by resource instead of by day. */
export interface CalendarLane {
  id: string;
  label: string;
  sublabel?: string;
}

export interface LaneConfig {
  /** Key into `CalendarEvent.resources` that decides which lane an event belongs to. */
  dimension: string;
  lanes: CalendarLane[];
}

/** Used when asking the shell to open the editor for a new event. */
export interface EventDraft {
  start: Date;
  end: Date;
  allDay: boolean;
  resources?: Record<string, string>;
}

export type CommitResult =
  | { ok: true }
  | { ok: false; code: 'conflict' | 'invalid' | 'forbidden' | 'not-found' | 'error'; message: string; details?: string[] };

/**
 * The seam between the calendar UI and whoever owns the data (your backend).
 * The calendar applies a drag/resize optimistically, awaits the gateway and rolls back with an
 * explanation if the answer is not `ok`.
 */
export interface CalendarGateway {
  update(event: CalendarEvent, previous: CalendarEvent): Promise<CommitResult>;
}

export interface CalendarToast {
  id: number;
  kind: 'error' | 'info';
  text: string;
}
