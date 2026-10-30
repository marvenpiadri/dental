import type { Key } from '../../core/i18n/i18n.service';

/** The pages of a patient file. A clinic can hide any of them except the overview (Setup > Patient file pages). */
export const PROFILE_PAGES = [
  { id: 'overview', key: 'profile.section.overview', icon: 'fa-house', clinical: false },
  { id: 'acts', key: 'page.acts', icon: 'fa-tooth', clinical: true },
  { id: 'appointments', key: 'profile.appointments', icon: 'fa-calendar-days', clinical: false },
  { id: 'billing', key: 'page.payments', icon: 'fa-wallet', clinical: false },
  { id: 'quotes', key: 'page.quotes', icon: 'fa-file-invoice', clinical: true },
  { id: 'visits', key: 'profile.visits', icon: 'fa-notes-medical', clinical: true },
  { id: 'documents', key: 'page.imaging', icon: 'fa-x-ray', clinical: true },
  { id: 'forms', key: 'forms.title', icon: 'fa-file-pen', clinical: true },
] as const satisfies readonly { id: string; key: Key; icon: string; clinical: boolean }[];
export type Section = (typeof PROFILE_PAGES)[number]['id'];
