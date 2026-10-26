import type { Key } from '../../core/i18n/i18n.service';
import type { CalendarEvent } from '../../calendar/models/calendar.models';
import { Appointment, Chair, Dentist, Patient, STATUS_META } from '../models/dental.models';

import { STATUS_LABEL, STATUS_LOCK, typeKey } from './domain-keys';

export type GroupBy = 'chair' | 'dentist';

export interface MapContext {
  patients: Map<string, Patient>;
  dentists: Map<string, Dentist>;
  chairs: Map<string, Chair>;
  /** What the day view uses as columns; the other dimension is written on the card instead. */
  groupBy: GroupBy;
  t: (key: Key) => string;
}

/** One appointment, drawn once: the colour is the dentist, the lane is the chair or the dentist. */
export function toCalendarEvent(a: Appointment, ctx: MapContext): CalendarEvent {
  const meta = STATUS_META[a.status];
  const type = ctx.t(typeKey(a.type));
  const other = ctx.groupBy === 'chair' ? ctx.dentists.get(a.dentistId)?.name : ctx.chairs.get(a.chairId)?.name;
  const movable = a.status === 'scheduled' || a.status === 'confirmed';
  return {
    id: a.id,
    title: ctx.patients.get(a.patientId)?.fullName ?? ctx.t('pn.unknown'),
    start: a.start,
    end: a.end,
    allDay: false,
    calendarId: a.dentistId,
    subtitle: other ? `${type} · ${other}` : type,
    notes: a.note,
    resources: { dentist: a.dentistId, chair: a.chairId },
    // "Scheduled" is the default state, so it gets no badge; every other state does
    badge: a.status === 'scheduled' ? undefined : { icon: meta.icon, label: ctx.t(STATUS_LABEL[a.status]) },
    tone: meta.tone,
    locked: !movable,
    lockedReason: STATUS_LOCK[a.status] && ctx.t(STATUS_LOCK[a.status]!),
  };
}
