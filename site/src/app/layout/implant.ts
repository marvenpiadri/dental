import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID, afterNextRender, effect, inject, input, signal, viewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { ImplantScene } from '../three/implant-scene';

/** A single-tooth implant you can pull apart and turn. three.js and the 2 MB model load only in the browser, when it is near the screen. */
@Component({
  selector: 'ds-implant',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #c role="img" [attr.aria-label]="label()"></canvas>
    <ul class="parts" role="group" [attr.aria-label]="allLabel()">
      <li><button type="button" [attr.aria-pressed]="sel() === -1" (click)="pick(-1)">{{ allLabel() }}</button></li>
      @for (p of parts(); track p.h; let i = $index) { <li><button type="button" [attr.aria-pressed]="sel() === i" (click)="pick(i)">{{ p.h }}</button></li> }
    </ul>
    <p class="cap" aria-live="polite">@if (sel() >= 0) { <b>{{ parts()[sel()].h }}</b> {{ parts()[sel()].p }} } @else { {{ hint() }} }</p>
    <label class="cut"><span>{{ together() }}</span><input type="range" min="0" max="100" step="1" [value]="amount()" (input)="onAmount($event)" [attr.aria-label]="together() + ' / ' + apart()" /><span>{{ apart() }}</span></label>
    @if (failed()) { <p class="mfail">{{ label() }}</p> }`,
  styles: `:host { display: block; position: relative; touch-action: pan-y; cursor: grab; } canvas { width: 100%; height: 100%; display: block; } :host(:active) { cursor: grabbing; }
    .parts { position: absolute; right: var(--gutter); top: 50%; transform: translateY(-50%); list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; justify-items: end; }
    .parts button { font: 500 15px/1 var(--sans); color: #a8a8b0; background: transparent; border: 0; border-right: 2px solid transparent; padding: 10px 14px; cursor: pointer; } .parts button:hover { color: #f4f4f5; } .parts button[aria-pressed='true'] { color: #f4f4f5; border-right-color: #00e5ff; }
    .cap { position: absolute; left: var(--gutter); bottom: 72px; width: min(360px, 34vw); color: #c8c8cf; font-size: 15px; } .cap b { display: block; color: #f4f4f5; font: 330 clamp(1.6rem, 2.4vw, 2.2rem)/1.05 var(--display); letter-spacing: -.04em; margin-bottom: 8px; }
    .cut { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); display: flex; align-items: center; gap: 14px; font: 500 13px/1 var(--sans); color: #f4f4f5; } .cut input { width: min(300px, 40vw); accent-color: #00e5ff; } .mfail { position: absolute; inset: auto 0 0; text-align: center; opacity: .7; }`,
})
export class Implant {
  readonly label = input('');
  readonly together = input('Together');
  readonly apart = input('Apart');
  readonly hint = input('');
  readonly allLabel = input('All parts');
  readonly parts = input.required<{ h: string; p: string }[]>();
  protected readonly amount = signal(0);
  protected readonly sel = signal(-1);
  protected readonly failed = signal(false);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('c');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private scene: ImplantScene | null = null;
  private touched = false;

  constructor() {
    const browser = isPlatformBrowser(inject(PLATFORM_ID)), destroy = inject(DestroyRef);
    afterNextRender(() => {
      if (!browser) return;
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; let gone = false;
      const start = async () => {
        try {
          const { ImplantScene } = await import('../three/implant-scene');
          const s = await ImplantScene.create(this.canvas().nativeElement);
          if (gone) { s.dispose(); return; }
          this.scene = s; s.setExplode(this.amount() / 100); s.select(this.sel());
          if (reduced) { this.amount.set(100); s.setExplode(1); } else this.open();
        } catch { this.failed.set(true); }
      };
      const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { io.disconnect(); void start(); } }, { rootMargin: '600px' });
      io.observe(this.host.nativeElement);
      destroy.onDestroy(() => { gone = true; io.disconnect(); this.scene?.dispose(); });
    });
    effect(() => { this.scene?.select(this.sel()); });
  }
  /** The parts come apart once when the model first appears; after that the slider belongs to the visitor. */
  private open(): void { const t0 = performance.now(); const step = (now: number) => { if (this.touched) return; const k = Math.min(1, (now - t0) / 2600), e = k * k * (3 - 2 * k); this.amount.set(Math.round(e * 100)); this.scene?.setExplode(e); if (k < 1) requestAnimationFrame(step); }; setTimeout(() => requestAnimationFrame(step), 700); }
  protected onAmount(e: Event): void { this.touched = true; const v = +(e.target as HTMLInputElement).value; this.amount.set(v); this.scene?.setExplode(v / 100); }
  protected pick(i: number): void { this.sel.set(i); }
}
