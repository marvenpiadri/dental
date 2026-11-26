import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SiteService } from '../core/site-service';
import { APP_URL, AVAILABLE } from '../core/site';
import { Jaw } from '../layout/jaw';
import { Implant } from '../layout/implant';
import { ScheduleDemo } from '../layout/schedule-demo';
import { Screen } from '../layout/screen';
import { STATE_DOT, ToothState } from '../three/jaw-scene';
import { home } from '../copy/home';
import { Seo } from '../core/seo';

const REEL_MS = 8000;

@Component({ selector: 'ds-home', imports: [RouterLink, Jaw, Implant, ScheduleDemo, Screen], changeDetection: ChangeDetectionStrategy.OnPush, templateUrl: './home.html' })
export class Home {
  protected readonly site = inject(SiteService);
  protected readonly c = this.site.pick(home);
  protected readonly appUrl = APP_URL;
  protected readonly step = signal(0);
  /** 0..1 progress of the current story card; the reel moves on by itself while it is on screen and not being touched. */
  protected readonly progress = signal(0);
  protected readonly avail = AVAILABLE;
  protected readonly dots = STATE_DOT;
  protected readonly states: ToothState[] = ['caries', 'filling', 'crown', 'implant', 'rootcanal', 'missing'];
  private readonly reel = viewChild.required<ElementRef<HTMLElement>>('reel');
  private paused = false; private onScreen = false; private swipeX = 0;

  constructor() {
    inject(Seo).set(() => this.c().seo, '');
    const browser = isPlatformBrowser(inject(PLATFORM_ID)), destroy = inject(DestroyRef);
    afterNextRender(() => {
      if (!browser) return;
      const el = this.reel().nativeElement;
      const io = new IntersectionObserver((e) => { this.onScreen = e[0].isIntersecting; }, { threshold: 0.6 });
      io.observe(el);
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const tick = setInterval(() => {
          if (!this.onScreen || this.paused) return;
          const p = this.progress() + 100 / REEL_MS;
          if (p >= 1) this.go(this.step() + 1); else this.progress.set(p);
        }, 100);
        destroy.onDestroy(() => clearInterval(tick));
      }
      destroy.onDestroy(() => io.disconnect());
    });
  }
  protected link(path: string): string[] { return path ? ['/', this.site.lang(), path] : ['/', this.site.lang()]; }
  protected hash(to: string): boolean { return to.startsWith('#'); }
  protected go(i: number): void { const n = this.c().reel.steps.length; this.step.set(((i % n) + n) % n); this.progress.set(0); }
  protected hold(on: boolean): void { this.paused = on; }
  protected swipeStart(e: PointerEvent): void { this.swipeX = e.clientX; }
  protected swipeEnd(e: PointerEvent): void { const dx = e.clientX - this.swipeX; if (Math.abs(dx) > 40) this.go(this.step() + (dx < 0 ? 1 : -1)); }
  protected key(e: KeyboardEvent): void { if (e.key === 'ArrowRight') this.go(this.step() + 1); else if (e.key === 'ArrowLeft') this.go(this.step() - 1); }
}
