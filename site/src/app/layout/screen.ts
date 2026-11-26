import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** A real screenshot of the app (synthetic data) in a laptop frame. */
@Component({
  selector: 'ds-screen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="lid"><img [src]="src()" [alt]="alt()" width="2000" height="1250" loading="lazy" decoding="async" /></div><div class="base" aria-hidden="true"></div>`,
  styles: `:host { display: block; } .lid { background: #0b0b0c; padding: 12px 12px 14px; border-radius: 14px 14px 4px 4px; box-shadow: 0 40px 80px -30px #0006, 0 0 0 1px #00000022; } img { width: 100%; height: auto; border-radius: 3px; background: #fff; }
    .base { height: 12px; margin-inline: -3%; background: linear-gradient(#cfcfd4, #9a9aa0); border-radius: 0 0 14px 14px; box-shadow: 0 18px 30px -18px #0007; }`,
})
export class Screen { readonly src = input.required<string>(); readonly alt = input(''); }
