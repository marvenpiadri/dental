import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { EventTone } from '../../models/calendar.models';
import { CalIconComponent, IconName } from '../cal-icon/cal-icon.component';

/** Card used inside the day / week time grid. Position and size are set by the parent. */
@Component({
  selector: 'cal-event-block',
  imports: [CalIconComponent],
  templateUrl: './event-block.component.html',
  styleUrl: './event-block.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.compact]': 'compact()',
    '[class.cut-start]': 'continuesBefore()',
    '[class.cut-end]': 'continuesAfter()',
    '[class.is-dragging]': 'dragging()',
    '[class.is-locked]': 'locked()',
    '[class.tone-muted]': "tone() === 'muted'",
    '[class.tone-done]': "tone() === 'done'",
    '[class.tone-attention]': "tone() === 'attention'",
    '[class.tone-active]': "tone() === 'active'",
    '[style.--c]': 'color()',
    '[attr.aria-label]': 'ariaLabel()',
    role: 'button',
    tabindex: '0',
  },
})
export class EventBlockComponent {
  readonly title = input.required<string>();
  readonly color = input.required<string>();
  readonly time = input('');
  readonly subtitle = input('');
  readonly badge = input<{ icon: IconName; label: string } | null>(null);
  readonly tone = input<EventTone>('normal');
  readonly compact = input(false);
  readonly locked = input(false);
  readonly continuesBefore = input(false);
  readonly continuesAfter = input(false);
  readonly dragging = input(false);

  protected ariaLabel(): string {
    return [this.title(), this.time(), this.subtitle(), this.badge()?.label].filter(Boolean).join(', ');
  }
}
