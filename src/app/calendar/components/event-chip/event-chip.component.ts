import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CalIconComponent } from '../cal-icon/cal-icon.component';

/**
 * Compact one-line event: used for all-day / multi-day bars and for timed events inside month cells.
 *  - `bar`  : tinted pill with a calendar icon (spans several days)
 *  - `line` : coloured left rule, title on the left, start time on the right
 */
@Component({
  selector: 'cal-event-chip',
  imports: [CalIconComponent],
  templateUrl: './event-chip.component.html',
  styleUrl: './event-chip.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ev-color',
    '[class.bar]': "variant() === 'bar'",
    '[class.line]': "variant() === 'line'",
    '[class.cut-start]': 'continuesBefore()',
    '[class.cut-end]': 'continuesAfter()',
    '[class.is-dragging]': 'dragging()',
    '[class.muted]': "tone() === 'muted'",
    '[style.--c]': 'color()',
    '[attr.title]': 'tooltip()',
    role: 'button',
    tabindex: '0',
  },
})
export class EventChipComponent {
  readonly title = input.required<string>();
  readonly color = input.required<string>();
  readonly variant = input<'bar' | 'line'>('line');
  readonly time = input<string>('');
  readonly continuesBefore = input(false);
  readonly continuesAfter = input(false);
  readonly dragging = input(false);
  readonly tone = input<'normal' | 'muted' | 'done' | 'attention' | 'active'>('normal');
  readonly tooltip = input<string | null>(null);
}
