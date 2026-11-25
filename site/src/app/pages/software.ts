import { Component, inject } from '@angular/core';
import { SiteService, pair } from '../core/site-service';
import { Molar } from '../layout/molar';

/** Placeholder until the software page is designed. The molar is mounted here so the model can be reviewed in place. */
@Component({
  selector: 'ds-software', imports: [Molar],
  template: `<section class="wrap" style="padding-block:140px 60px"><h1>Software</h1></section>
    <section class="dark-zone" style="background:#000;color:#fff;height:min(86vh,760px)"><ds-molar style="height:100%" [label]="label()" [cutLabel]="cut()" /></section>`,
})
export class Software {
  private readonly s = inject(SiteService);
  protected readonly label = this.s.pick(pair('A lower molar, cut open to show the dentin and the pulp.', 'Une molaire inférieure, coupée pour montrer la dentine et la pulpe.'));
  protected readonly cut = this.s.pick(pair('Cut', 'Couper'));
}
