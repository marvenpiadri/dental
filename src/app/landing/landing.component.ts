import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { ThemeService } from '../core/theme.service';
import { I18n } from '../core/i18n/i18n.service';
import { COPY, STEPS, STEP_SHOT, ShotId, StepId } from './landing-copy';

/**
 * `/`: the public landing page. Every screenshot is a capture of the real application (tools/capture-landing.mjs).
 * Light and dark captures are both in the markup and CSS shows the right one, so the server's HTML never depends on the theme.
 */
@Component({
  selector: 'den-landing',
  imports: [RouterLink],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingComponent {
  protected readonly i18n = inject(I18n);
  protected readonly themeService = inject(ThemeService);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  protected readonly c = computed(() => COPY[this.i18n.lang()]);
  protected readonly steps = STEPS;
  protected readonly step = signal<StepId>('book');
  protected readonly current = computed(() => this.c().day.steps[this.step()]);
  protected readonly stepShot = computed(() => STEP_SHOT[this.step()]);
  protected readonly nextLang = computed(() => (this.i18n.lang() === 'en' ? 'fr' : 'en'));

  constructor() {
    effect(() => {
      const c = this.c();
      this.title.setTitle(c.seoTitle);
      this.meta.updateTag({ name: 'description', content: c.seoDescription });
      this.meta.updateTag({ name: 'robots', content: 'index, follow' });
    });
  }

  protected src(id: ShotId, theme: 'light' | 'dark'): string { return `landing/${id}-${theme}-${this.i18n.lang()}.jpg`; }

  /** Arrow keys move between the tabs, as in a native tab list. */
  protected key(e: KeyboardEvent): void {
    const i = STEPS.indexOf(this.step());
    const to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
    if (to === null) return;
    e.preventDefault();
    const id = STEPS[(to + STEPS.length) % STEPS.length];
    this.step.set(id);
    (e.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-step="${id}"]`)?.focus();
  }
}
