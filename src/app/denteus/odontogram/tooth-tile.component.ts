import { ChangeDetectionStrategy, Component, ElementRef, PLATFORM_ID, computed, effect, inject, input, output, viewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { ToothRecord } from './engine/chart';
import { TOOTH_TEMPLATE, isUpperTooth } from './engine/vendor/anatomy/profiles';
import { markProposed, paintTooth, prepareArt } from './engine/render';
import { ToothArt, type Template } from './tooth-art.service';

/** One tooth: the real anatomy SVG painted from its record. Draws state; owns none. */
@Component({
  selector: 'den-tooth-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.upper]': 'upper()' },
  template: `
    <button type="button" class="tile" [class.selected]="selected()" [attr.aria-pressed]="selected()" [attr.aria-label]="label()" (click)="pick.emit($event)">
      @if (upper()) { <span class="no">{{ shown() }}</span> }
      <span class="art" #art [style.transform]="transform()"></span>
      @if (!upper()) { <span class="no">{{ shown() }}</span> }
    </button>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .tile { all: unset; box-sizing: border-box; display: grid; justify-items: center; gap: 2px; width: 100%; padding: 4px 2px; border-radius: 10px; cursor: pointer; border: 1px solid transparent; }
    .tile:hover { background: var(--app-hover); }
    .tile.selected { border-color: var(--app-text); background: var(--app-hover); }
    .tile:focus-visible { outline: 2px solid var(--app-text); outline-offset: 1px; }
    .art { display: block; width: 100%; max-width: 64px; aspect-ratio: 39 / 72; }
    .art :is(svg) { width: 100%; height: 100%; display: block; }
    .no { font-size: 11px; font-weight: 600; color: var(--app-muted); }
    :host-context(.dark) .art { filter: brightness(0.92); }
  `,
})
export class ToothTileComponent {
  readonly no = input.required<number>();
  /** Number as shown to the user (numbering system); defaults to the FDI number. */
  readonly display = input<string | null>(null);
  protected readonly shown = computed(() => this.display() ?? String(this.no()));
  readonly state = input.required<ToothRecord>();
  /** When drawing the plan: the findings, so proposed work can be told apart from existing work. */
  readonly findings = input<ToothRecord | null>(null);
  readonly selected = input(false);
  readonly showBase = input(true);
  readonly showHealthyPulp = input(true);
  readonly label = input('');
  readonly pick = output<MouseEvent>();

  private readonly art = inject(ToothArt);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('art');
  private svg: SVGElement | null = null;
  private tplOfSvg: Template | null = null;

  protected readonly meta = computed(() => TOOTH_TEMPLATE.get(this.no()) ?? { tpl: 11 as Template, rot: 0, mirror: false });
  protected readonly upper = computed(() => isUpperTooth(this.no()));
  protected readonly transform = computed(() => {
    const m = this.meta();
    const sy = m.rot === 180 ? -1 : 1;
    return `scale(${sy * (m.mirror ? -1 : 1)}, ${sy})`;
  });

  constructor() {
    this.art.load();
    effect(() => {
      if (!this.browser) return;
      const tpl = this.meta().tpl as Template;
      const text = this.art.texts()[tpl];
      const state = this.state(), findings = this.findings();
      const opts = { showBase: this.showBase(), showHealthyPulp: this.showHealthyPulp() };
      if (!text) return;
      const host = this.host().nativeElement;
      if (!this.svg || this.tplOfSvg !== tpl) {
        this.svg = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement as unknown as SVGElement;
        prepareArt(this.svg);
        this.tplOfSvg = tpl;
        host.replaceChildren(this.svg);
      }
      const ids = paintTooth(this.svg, this.no(), state, opts);
      if (findings) {
        const clone = this.svg.cloneNode(true) as SVGElement;
        markProposed(this.svg, ids, paintTooth(clone, this.no(), findings, opts));
      }
    });
  }
}
