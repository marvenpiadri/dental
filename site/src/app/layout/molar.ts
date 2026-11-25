import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID, afterNextRender, inject, input, signal, viewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { MolarScene } from '../three/molar-scene';

/** A lower molar you can turn and cut open. three.js and the 0.9 MB model load only in the browser, when it is near the screen. */
@Component({
  selector: 'ds-molar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #c role="img" [attr.aria-label]="label()"></canvas>
    <label class="cut"><span>{{ cutLabel() }}</span><input type="range" min="0" max="100" step="1" [value]="cut()" (input)="onCut($event)" [attr.aria-label]="cutLabel()" /></label>
    @if (failed()) { <p class="mfail">{{ label() }}</p> }`,
  styles: `:host { display: block; position: relative; touch-action: pan-y; cursor: grab; } canvas { width: 100%; height: 100%; display: block; } :host(:active) { cursor: grabbing; }
    .cut { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); display: flex; align-items: center; gap: 14px; font: 500 13px/1 var(--sans); color: inherit; } .cut input { width: min(280px, 50vw); accent-color: #00e5ff; } .mfail { position: absolute; inset: auto 0 0; text-align: center; opacity: .7; }`,
})
export class Molar {
  readonly label = input('');
  readonly cutLabel = input('Cut');
  protected readonly cut = signal(0);
  protected readonly failed = signal(false);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('c');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private scene: MolarScene | null = null;

  constructor() {
    const browser = isPlatformBrowser(inject(PLATFORM_ID)), destroy = inject(DestroyRef);
    afterNextRender(() => {
      if (!browser) return;
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; let gone = false;
      const start = async () => {
        try {
          const { MolarScene } = await import('../three/molar-scene');
          const s = await MolarScene.create(this.canvas().nativeElement, reduced);
          if (gone) { s.dispose(); return; }
          this.scene = s; s.setCut(this.cut() / 100, true); if (!reduced) this.sweep();
        } catch { this.failed.set(true); }
      };
      const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { io.disconnect(); void start(); } }, { rootMargin: '600px' });
      io.observe(this.host.nativeElement);
      destroy.onDestroy(() => { gone = true; io.disconnect(); this.scene?.dispose(); });
    });
  }
  /** One slow opening cut when the model first appears; after that the slider is the visitor's. */
  private sweep(): void { const t0 = performance.now(); const step = (now: number) => { if (this.touched) return; const k = Math.min(1, (now - t0) / 2600), e = k * k * (3 - 2 * k); this.cut.set(Math.round(e * 100)); this.scene?.setCut(e); if (k < 1) requestAnimationFrame(step); }; setTimeout(() => requestAnimationFrame(step), 900); }
  private touched = false;
  protected onCut(e: Event): void { this.touched = true; const v = +(e.target as HTMLInputElement).value; this.cut.set(v); this.scene?.setCut(v / 100); }
}
