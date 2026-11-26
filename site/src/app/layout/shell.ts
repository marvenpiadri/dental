import { ChangeDetectionStrategy, Component, afterNextRender, ElementRef, HostListener, PLATFORM_ID, effect, inject, signal, computed } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { APP_URL, Lang, isLang } from '../core/site';
import { SiteService } from '../core/site-service';
import { ThemeService, Theme } from '../core/theme';
import { shell } from '../copy/shell';

const NAV = [['ecosystem', ''], ['software', ''], ['services', 'services'], ['partnership', 'partnership'], ['franchise', 'franchise'], ['about', 'about']] as const;

@Component({
  selector: 'ds-shell',
  imports: [RouterLink, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.html',
})
export class Shell {
  private readonly router = inject(Router);
  private readonly doc = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly site = inject(SiteService);
  protected readonly themeService = inject(ThemeService);
  protected readonly t = this.site.pick(shell);
  protected readonly appUrl = APP_URL;
  protected readonly nav = NAV;
  protected readonly menuOpen = signal(false);
  protected readonly settingsOpen = signal(false);
  protected readonly onDarkZone = signal(false);
  private readonly url = toSignal(this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map(() => this.router.url)), { initialValue: this.router.url });
  protected readonly rest = computed(() => this.url().split(/[?#]/)[0].split('/').filter(Boolean).slice(1));
  /** The home page opens on a dark stage, so the bar starts light-on-dark and settles once the stage is scrolled past. */
  protected readonly overDark = computed(() => this.onDarkZone());
  protected readonly themes: { id: Theme; key: 'system' | 'light' | 'dark' }[] = [{ id: 'system', key: 'system' }, { id: 'light', key: 'light' }, { id: 'dark', key: 'dark' }];

  constructor() {
    const route = this.router.routerState.root;
    effect(() => {
      this.url();
      if (this.browser) setTimeout(() => this.onScroll());
      const seg = this.router.url.split(/[?#]/)[0].split('/').filter(Boolean)[0];
      const lang: Lang = isLang(seg) ? seg : 'en';
      this.site.lang.set(lang);
      this.doc.documentElement.lang = lang;
      if (this.browser) { try { localStorage.setItem('ds-lang', lang); } catch { /* private mode */ } }
      this.menuOpen.set(false); this.settingsOpen.set(false);
    });
    void route;
    if (this.browser) { afterNextRender(() => this.onScroll()); }
  }

  protected link(path: string): string[] { return path ? ['/', this.site.lang(), path] : ['/', this.site.lang()]; }
  protected other(l: Lang): string[] { return ['/', l, ...this.rest()]; }
  protected langName(l: Lang): string { return l === 'en' ? 'English' : 'Français'; }
  protected readonly langs: Lang[] = ['en', 'fr'];
  protected readonly year = new Date().getFullYear();

  /** The bar turns light-on-dark while it sits over a dark section. */
  @HostListener('window:scroll') onScroll(): void {
    if (!this.browser) return;
    const y = 36; this.onDarkZone.set([...this.doc.querySelectorAll('.dark-zone')].some((e) => { const r = e.getBoundingClientRect(); return r.top <= y && r.bottom >= y; }));
  }
  @HostListener('document:keydown.escape') close(): void { this.settingsOpen.set(false); this.menuOpen.set(false); }
  @HostListener('document:click', ['$event']) outside(e: Event): void { if (this.settingsOpen() && !(e.target as Element).closest('.settings')) this.settingsOpen.set(false); }
}
