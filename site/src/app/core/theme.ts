import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type Theme = 'system' | 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly theme = signal<Theme>(this.read());

  private read(): Theme {
    if (!this.browser) return 'system';
    try { const t = localStorage.getItem('ds-theme'); return t === 'light' || t === 'dark' ? t : 'system'; } catch { return 'system'; }
  }
  set(t: Theme): void {
    this.theme.set(t);
    if (!this.browser) return;
    const el = document.documentElement;
    if (t === 'system') delete el.dataset['theme']; else el.dataset['theme'] = t;
    try { if (t === 'system') localStorage.removeItem('ds-theme'); else localStorage.setItem('ds-theme', t); } catch { /* private mode: the choice lasts for this visit */ }
  }
}
