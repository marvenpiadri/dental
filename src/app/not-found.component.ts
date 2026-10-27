import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'den-not-found',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ds-page' },
  template: `
    <header class="ds-head">
      <h1 class="ds-title">Page not found</h1>
    </header>
    <div class="ds-body">
      <div class="ds-empty">
        <h2>This page doesn’t exist</h2>
        <p>The link may be old or mistyped.</p>
        <a class="ds-btn ds-btn--primary" routerLink="/today">Go to Today</a>
      </div>
    </div>
  `,
})
export class NotFoundComponent {}
