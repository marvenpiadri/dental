import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CalendarStore } from '../../services/calendar-store.service';
import { CalIconComponent } from '../cal-icon/cal-icon.component';

/** Transient messages (rejected drags, failed saves). Rendered inside the calendar shell. */
@Component({
  selector: 'cal-toasts',
  imports: [CalIconComponent],
  templateUrl: './toast-stack.component.html',
  styleUrl: './toast-stack.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'status', 'aria-live': 'polite' },
})
export class ToastStackComponent {
  protected readonly store = inject(CalendarStore);
}
