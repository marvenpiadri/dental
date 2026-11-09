import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { I18n } from './core/i18n/i18n.service';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'den-not-found',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ds-page' },
  template: `
    <header class="ds-head">
      <h1 class="ds-title">{{ t('notFound.title') }}</h1>
    </header>
    <div class="ds-body">
      <div class="ds-empty">
        <h2>{{ t('notFound.heading') }}</h2>
        <p>{{ t('notFound.body') }}</p>
        <a class="ds-btn ds-btn--primary" routerLink="/today">{{ t('notFound.cta') }}</a>
      </div>
    </div>
  `,
})
export class NotFoundComponent {
  protected readonly t = inject(I18n).t;
}
