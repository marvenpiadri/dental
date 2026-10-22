import { CalendarCategory, CalendarEvent } from '../models/calendar.models';
import { addDays, addMinutes, startOfDay, startOfWeek, withMinutes } from '../utils/date.utils';

export const DEMO_CATEGORIES: CalendarCategory[] = [
  { id: 'product', name: 'Product Team', color: '#2563eb', visible: true },
  { id: 'personal', name: 'Personal', color: '#0ea5e9', visible: true },
  { id: 'learning', name: 'Learning', color: '#8b5cf6', visible: true },
  { id: 'travel', name: 'Travel', color: '#f97316', visible: true },
  { id: 'wellness', name: 'Wellness', color: '#10b981', visible: true },
  { id: 'marketing', name: 'Marketing', color: '#ec4899', visible: true },
  { id: 'support', name: 'Support', color: '#14b8a6', visible: true },
];

/** Tiny seeded RNG so the demo data is stable between reloads. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TITLES: Record<string, string[]> = {
  product: ['Brainstorm', 'Product Sync', 'Design Review', 'Sprint Planning', 'Team Retro', 'Code Review'],
  personal: ['Lunch with Sam', 'Family Call', 'Dentist', 'Groceries'],
  learning: ['Lunch & Learn', 'Angular Workshop', 'Reading Hour'],
  travel: ['Travel Block', 'Airport Transfer', 'Hotel Check-in'],
  wellness: ['Yoga Break', 'Gym', 'Meditation', 'Run'],
  marketing: ['Campaign Review', 'Content Sync', 'Brand Workshop'],
  support: ['Customer Call', 'Ticket Triage', 'Usability Test'],
};

const DURATIONS = [30, 45, 60, 60, 90, 120, 150];

/**
 * Builds demo events around `today`. The current week is hand-written so the first
 * screen looks right; the weeks around it are generated.
 */
export function createDemoEvents(today: Date): CalendarEvent[] {
  const monday = startOfWeek(today, 1);
  const events: CalendarEvent[] = [];
  let seq = 0;

  const add = (
    dayOffset: number,
    time: string,
    minutes: number,
    title: string,
    calendarId: string,
    extra: Partial<CalendarEvent> = {},
  ) => {
    const [h, m] = time.split(':').map(Number);
    const start = withMinutes(addDays(monday, dayOffset), h * 60 + m);
    events.push({
      id: `demo-${++seq}`,
      title,
      start,
      end: addMinutes(start, minutes),
      allDay: false,
      calendarId,
      ...extra,
    });
  };

  const addAllDay = (firstDay: number, lastDay: number, title: string, calendarId: string) => {
    const start = startOfDay(addDays(monday, firstDay));
    events.push({
      id: `demo-${++seq}`,
      title,
      start,
      end: startOfDay(addDays(monday, lastDay + 1)),
      allDay: true,
      calendarId,
    });
  };

  // ---- the current week (Mon..Sun) -------------------------------------------------
  add(0, '08:30', 60, 'Weekly Planning', 'product');
  add(0, '10:00', 120, 'Brainstorm', 'product', { location: 'Room 4' });
  add(0, '10:30', 120, 'Angular Workshop', 'learning');
  add(0, '12:30', 60, 'Lunch with Sam', 'personal');
  add(0, '15:00', 60, 'Customer Call', 'support');

  add(1, '08:30', 60, 'Product Sync', 'product');
  add(1, '10:30', 120, 'Campaign Review', 'marketing');
  add(1, '13:00', 60, 'Yoga Break', 'wellness');
  add(1, '15:00', 120, 'Usability Test', 'support');

  add(2, '09:00', 60, 'Ticket Triage', 'support');
  add(2, '11:00', 45, 'Design Review', 'product');
  add(2, '12:30', 60, 'Lunch & Learn', 'learning');
  add(2, '14:00', 150, 'Travel Block', 'travel');
  add(2, '17:30', 60, 'Gym', 'wellness');

  add(3, '08:00', 180, 'Usability Test', 'support');
  add(3, '13:00', 120, 'Design Review', 'product');
  add(3, '14:00', 120, 'Code Review', 'product');
  add(3, '16:30', 60, 'Team Retro', 'product');

  add(4, '09:00', 60, 'Product Sync', 'product');
  add(4, '10:30', 150, 'Campaign Review', 'marketing');
  add(4, '13:30', 60, 'Yoga Break', 'wellness');
  add(4, '15:00', 150, 'Airport Transfer', 'travel');

  add(5, '09:00', 60, 'Gym', 'wellness');
  add(5, '10:30', 60, 'Family Call', 'personal');
  add(5, '14:00', 90, 'Reading Hour', 'learning');

  add(6, '09:00', 180, 'Run', 'wellness');
  add(6, '15:00', 90, 'Groceries', 'personal');
  add(6, '19:00', 60, 'Weekly Review', 'product');

  addAllDay(1, 3, 'Tech Conference', 'learning');
  addAllDay(3, 4, 'Client Visit', 'travel');
  addAllDay(5, 6, 'Weekend Getaway', 'personal');

  // ---- generated weeks around it -----------------------------------------------------
  const rand = mulberry32(2026);
  const ids = Object.keys(TITLES);
  for (let offset = -42; offset < 63; offset++) {
    if (offset >= 0 && offset < 7) continue;
    const dow = ((offset % 7) + 7) % 7; // 0 = Monday
    const count = dow >= 5 ? Math.floor(rand() * 2) : 1 + Math.floor(rand() * 3);
    for (let i = 0; i < count; i++) {
      const cal = ids[Math.floor(rand() * ids.length)];
      const titles = TITLES[cal];
      const startSlot = 16 + Math.floor(rand() * 20); // 08:00 .. 17:30, every 30 min
      add(
        offset,
        `${String(Math.floor(startSlot / 2)).padStart(2, '0')}:${startSlot % 2 ? '30' : '00'}`,
        DURATIONS[Math.floor(rand() * DURATIONS.length)],
        titles[Math.floor(rand() * titles.length)],
        cal,
      );
    }
  }

  addAllDay(-10, -9, 'Campaign Launch', 'marketing');
  addAllDay(-4, -3, 'Team Offsite', 'product');
  addAllDay(8, 10, 'Design Sprint Week', 'product');
  addAllDay(15, 17, 'Wellness Retreat', 'wellness');
  addAllDay(21, 22, 'Q4 Strategy Offsite', 'product');
  addAllDay(-18, -16, 'Customer Summit', 'support');

  return events;
}
