import { ChangeDetectionStrategy, Component, ElementRef, PLATFORM_ID, afterNextRender, inject, signal, viewChildren, DestroyRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SiteService } from '../core/site-service';
import { APP_URL, AVAILABLE } from '../core/site';
import { Jaw } from '../layout/jaw';
import { STATE_DOT, ToothState } from '../three/jaw-scene';
import { home } from '../copy/home';
import { Seo } from '../core/seo';

@Component({ selector: 'ds-home', imports: [RouterLink, Jaw], changeDetection: ChangeDetectionStrategy.OnPush, templateUrl: './home.html' })
export class Home {
  protected readonly site = inject(SiteService);
  protected readonly c = this.site.pick(home);
  protected readonly appUrl = APP_URL;
  protected readonly step = signal(0);
  protected readonly avail = AVAILABLE;
  protected readonly dots = STATE_DOT;
  protected readonly states: ToothState[] = ['caries', 'filling', 'crown', 'implant', 'rootcanal', 'missing'];
  private readonly triggers = viewChildren<ElementRef<HTMLElement>>('trigger');

  constructor() {
    inject(Seo).set(() => this.c().seo, '');
    const browser = isPlatformBrowser(inject(PLATFORM_ID)), destroy = inject(DestroyRef);
    afterNextRender(() => {
      if (!browser) return;
      const els = this.triggers().map((t) => t.nativeElement);
      const io = new IntersectionObserver((entries) => { for (const e of entries) if (e.isIntersecting) this.step.set(els.indexOf(e.target as HTMLElement)); }, { threshold: 0.55 });
      els.forEach((e) => io.observe(e));
      destroy.onDestroy(() => io.disconnect());
    });
  }
  protected link(path: string): string[] { return path ? ['/', this.site.lang(), path] : ['/', this.site.lang()]; }
  protected go(i: number): void { this.triggers()[i]?.nativeElement.scrollIntoView({ behavior: 'smooth' }); }
}
