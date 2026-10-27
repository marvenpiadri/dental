import type { Key } from '../../core/i18n/i18n.service';
import type { AppointmentStatus, AppointmentType } from '../models/dental.models';

type StatusKeys = Record<AppointmentStatus, Key>;
export const STATUS_LABEL: StatusKeys = {
  'scheduled': 'st.scheduled',
  'confirmed': 'st.confirmed',
  'arrived': 'st.arrived',
  'in-progress': 'st.in-progress',
  'completed': 'st.completed',
  'cancelled': 'st.cancelled',
  'no-show': 'st.no-show',
};
export const STATUS_DESC: StatusKeys = {
  'scheduled': 'std.scheduled',
  'confirmed': 'std.confirmed',
  'arrived': 'std.arrived',
  'in-progress': 'std.in-progress',
  'completed': 'std.completed',
  'cancelled': 'std.cancelled',
  'no-show': 'std.no-show',
};
export const STATUS_ACTION: StatusKeys = {
  'scheduled': 'act.scheduled',
  'confirmed': 'act.confirmed',
  'arrived': 'act.arrived',
  'in-progress': 'act.in-progress',
  'completed': 'act.completed',
  'cancelled': 'act.cancelled',
  'no-show': 'act.no-show',
};
export const STATUS_LOCK: Partial<StatusKeys> = {
  'arrived': 'lock.arrived',
  'in-progress': 'lock.in-progress',
  'completed': 'lock.completed',
  'cancelled': 'lock.cancelled',
  'no-show': 'lock.no-show',
};
export const typeKey = (id: AppointmentType['id']): Key => `ty.${id}` as Key;
