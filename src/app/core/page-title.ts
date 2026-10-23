import { Injectable, Injector, effect, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router, RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { I18n, Key } from './i18n/i18n.service';

/** Sets the browser tab title from the route's `titleKey`, and again whenever the language changes. */
@Injectable({ providedIn: 'root' })
export class PageTitle extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly i18n = inject(I18n);
  // The Router itself needs the title strategy, so asking for it here would be circular: resolve it later.
  private readonly injector = inject(Injector);

  constructor() {
    super();
    effect(() => {
      this.i18n.lang();
      this.updateTitle(this.injector.get(Router).routerState.snapshot);
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    let route = snapshot.root;
    while (route.firstChild) route = route.firstChild;
    const key = route.data['titleKey'] as Key | undefined;
    this.title.setTitle(key ? `${this.i18n.t(key)} · ${this.i18n.t('app.name')}` : this.i18n.t('app.name'));
  }
}
