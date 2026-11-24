import { ChangeDetectionStrategy, Component, ElementRef, PLATFORM_ID, effect, inject, input, signal, viewChild, afterNextRender, DestroyRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { JawScene, ToothState } from '../three/jaw-scene';

/** The 3D jaw. three.js and the model (about 3 MB) load only in the browser, and only when the stage is near the screen. */
@Component({
  selector: 'ds-jaw',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #c role="img" [attr.aria-label]="label()"></canvas><div class="jlayer" #l></div>@if (failed()) { <p class="jfail">{{ label() }}</p> }`,
  styles: `:host { display: block; touch-action: pan-y; cursor: grab; } canvas { width: 100%; height: 100%; } :host(:active) { cursor: grabbing; }`,
})
export class Jaw {
  readonly step = input(0);
  readonly hero = input(false);
  readonly label = input('');
  readonly tooth = input('Tooth');
  readonly names = input.required<Record<ToothState, string>>();
  protected readonly failed = signal(false);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('c');
  private readonly layer = viewChild.required<ElementRef<HTMLElement>>('l');
  private scene: JawScene | null = null;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    const browser = isPlatformBrowser(inject(PLATFORM_ID)), destroy = inject(DestroyRef);
    afterNextRender(() => {
      if (!browser) return;
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      let gone = false;
      const start = async () => {
        try {
          const { JawScene } = await import('../three/jaw-scene');
          const s = await JawScene.create({ canvas: this.canvas().nativeElement, layer: this.layer().nativeElement, names: this.names(), tooth: this.tooth(), reduced });
          if (gone) { s.dispose(); return; }
          this.scene = s; s.setStep(this.step(), this.hero(), true);
        } catch { this.failed.set(true); }
      };
      const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { io.disconnect(); void start(); } }, { rootMargin: '700px' });
      io.observe(this.host.nativeElement);
      destroy.onDestroy(() => { gone = true; io.disconnect(); this.scene?.dispose(); });
    });
    effect(() => { const s = this.step(), h = this.hero(); this.scene?.setStep(s, h); });
  }
}
