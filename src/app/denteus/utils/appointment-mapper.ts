import type { CalendarEvent } from '../../calendar/models/calendar.models';
import { APPOINTMENT_TYPES, Appointment, AppointmentStatus, Chair, Dentist, Patient, STATUS_META } from '../models/dental.models';

export type GroupBy = 'chair' | 'dentist';

export interface MapContext {
  patients: Map<string, Patient>;
  dentists: Map<string, Dentist>;
  chairs: Map<string, Chair>;
  /** What the day view uses as columns; the other dimension is written on the card instead. */
  groupBy: GroupBy;
}

const LOCKED_REASON: Partial<Record<AppointmentStatus, string>> = {
  arrived: 'The patient is already here. Finish or cancel the visit instead of moving it.',
  'in-progress': 'Treatment has started, so this appointment can no longer be moved.',
  completed: "Completed appointments can't be rescheduled.",
  cancelled: 'Reinstate this appointment before rescheduling it.',
  'no-show': 'Reinstate this appointment before rescheduling it.',
};

const TYPE_LABEL = new Map(APPOINTMENT_TYPES.map((t) => [t.id, t.label]));

/** One appointment, drawn once: the colour is the dentist, the lane is the chair or the dentist. */
export function toCalendarEvent(a: Appointment, ctx: MapContext): CalendarEvent {
  const meta = STATUS_META[a.status];
  const type = TYPE_LABEL.get(a.type) ?? a.type;
  const other = ctx.groupBy === 'chair' ? ctx.dentists.get(a.dentistId)?.name : ctx.chairs.get(a.chairId)?.name;
  const movable = a.status === 'scheduled' || a.status === 'confirmed';
  return {
    id: a.id,
    title: ctx.patients.get(a.patientId)?.fullName ?? 'Unknown patient',
    start: a.start,
    end: a.end,
    allDay: false,
    calendarId: a.dentistId,
    subtitle: other ? `${type} · ${other}` : type,
    notes: a.note,
    resources: { dentist: a.dentistId, chair: a.chairId },
    // "Scheduled" is the default state, so it gets no badge; every other state does
    badge: a.status === 'scheduled' ? undefined : { icon: meta.icon, label: meta.label },
    tone: meta.tone,
    locked: !movable,
    lockedReason: LOCKED_REASON[a.status],
  };
}
