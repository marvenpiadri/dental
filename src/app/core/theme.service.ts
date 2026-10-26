import { DOCUMENT } from '@angular/common';
import { Injectable, REQUEST, effect, inject, signal } from '@angular/core';
import { readCookie } from './cookie';

export type Theme = 'light' | 'dark';

const COOKIE = 'dtl-theme';

/**
 * The one source of truth for light/dark.
 *
 * The choice lives in a cookie, not localStorage, because only a cookie reaches the server: SSR can
 * then render the right theme in the first byte instead of flashing white. With no cookie, the inline
 * script in index.html applies the system preference before first paint and this service adopts it.
 * Markup must never branch on the theme (the server can't know the system preference): swap icons
 * with CSS on [data-theme], or hydration would disagree with the server's HTML.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly doc = inject(DOCUMENT);
  private readonly request = inject(REQUEST, { optional: true });

  readonly theme = signal<Theme>(this.initial());

  constructor() {
    effect(() => {
      const root = this.doc.documentElement;
      root.setAttribute('data-theme', this.theme());
      root.classList.toggle('dark', this.theme() === 'dark');
    });
  }

  toggle(): void {
    const next: Theme = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    this.doc.cookie = `${COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }

  private initial(): Theme {
    const saved = readCookie(this.doc, this.request, COOKIE, 'light|dark');
    if (saved === 'light' || saved === 'dark') return saved;
    return this.doc.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
}
