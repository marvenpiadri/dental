import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const ICONS = {
  'chevron-left': ['m15 18-6-6 6-6'],
  'chevron-right': ['m9 18 6-6-6-6'],
  'chevrons-left': ['m11 17-5-5 5-5', 'm18 17-5-5 5-5'],
  'chevrons-right': ['m6 17 5-5-5-5', 'm13 17 5-5-5-5'],
  'chevrons-up-down': ['m7 15 5 5 5-5', 'm7 9 5-5 5 5'],
  plus: ['M5 12h14', 'M12 5v14'],
  search: ['M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z', 'm21 21-4.3-4.3'],
  calendar: ['M8 2v4', 'M16 2v4', 'M3 10h18', 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z'],
  x: ['M18 6 6 18', 'm6 6 12 12'],
  check: ['M20 6 9 17l-5-5'],
  'arrow-right': ['M5 12h14', 'm12 5 7 7-7 7'],
  moon: ['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'],
  sun: [
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
    'M12 2v2',
    'M12 20v2',
    'm4.93 4.93 1.41 1.41',
    'm17.66 17.66 1.41 1.41',
    'M2 12h2',
    'M20 12h2',
    'm6.34 17.66-1.41 1.41',
    'm19.07 4.93-1.41 1.41',
  ],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  trash: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
  'map-pin': ['M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z', 'M12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z'],
  'align-left': ['M17 10H3', 'M21 6H3', 'M21 14H3', 'M17 18H3'],
  clock: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z', 'M12 6v6l4 2'],
  play: ['M6 3l14 9-14 9V3Z'],
  'circle-check': ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z', 'm9 12 2 2 4-4'],
  ban: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z', 'm4.9 4.9 14.2 14.2'],
  user: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z'],
  'user-x': ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z', 'm17 8 5 5', 'm22 8-5 5'],
  alert: [
    'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z',
    'M12 9v4',
    'M12 17h.01',
  ],
  phone: [
    'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92Z',
  ],
  'file-text': ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8'],
  history: ['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5', 'M12 7v5l4 2'],
} as const;

export type IconName = keyof typeof ICONS;

/** Tiny stroke icon set so the calendar has no icon-font or Tailwind dependency. */
@Component({
  selector: 'cal-icon',
  templateUrl: './cal-icon.component.html',
  styleUrl: './cal-icon.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalIconComponent {
  readonly name = input.required<IconName>();
  readonly size = input(16);
  readonly stroke = input(1.9);

  protected readonly paths = computed<readonly string[]>(() => ICONS[this.name()]);
}
