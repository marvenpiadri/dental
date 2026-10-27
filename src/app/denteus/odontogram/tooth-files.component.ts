import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import { ClinicDatabase } from '../services/clinic-database.service';

interface Shown { id: string; name: string; url: string; image: boolean }

/** Files the patient's record tags to one tooth (tagged in Documents). Read-only here; the chart never owns them. */
@Component({
  selector: 'den-tooth-files',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (items().length) {
      <h3>{{ t('dc.files', { n: tooth() }) }}</h3>
      <ul>
        @for (f of items(); track f.id) {
          <li><a [href]="f.url" target="_blank" rel="noopener" [attr.aria-label]="t('docs.open', { name: f.name })" [attr.title]="f.name">
            @if (f.image) { <img [src]="f.url" alt="" loading="lazy" /> } @else { <i class="fa-regular fa-file-pdf" aria-hidden="true"></i> }
          </a></li>
        }
      </ul>
    }
  `,
  styles: `
    :host { display: block; }
    h3 { margin: 6px 0; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--app-muted); }
    ul { display: flex; flex-wrap: wrap; gap: 8px; list-style: none; margin: 0; padding: 0; }
    a { display: grid; place-items: center; width: 88px; height: 88px; border: 1px solid var(--app-line); border-radius: var(--radius-control); overflow: hidden; background: var(--app-subtle); color: var(--app-muted); font-size: 28px; }
    img { width: 100%; height: 100%; object-fit: cover; }
  `,
})
export class ToothFilesComponent {
  readonly patientId = input.required<string>();
  /** FDI number of the first selected tooth. */
  readonly tooth = input.required<number>();

  private readonly db = inject(ClinicDatabase);
  protected readonly t = inject(I18n).t;
  protected readonly items = signal<Shown[]>([]);
  private run = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.release());
    effect(() => {
      const patient = this.patientId(), tooth = String(this.tooth());
      untracked(() => void this.load(patient, tooth));
    });
  }

  private release(): void {
    for (const f of this.items()) URL.revokeObjectURL(f.url);
  }

  private async load(patient: string, tooth: string): Promise<void> {
    const mine = ++this.run;
    let docs;
    try { docs = await this.db.listDocuments(patient); } catch { return; } // files are optional here: no files shown beats a broken chart
    if (mine !== this.run) return; // a newer tooth was picked meanwhile
    this.release();
    this.items.set(docs.filter((d) => d.tooth === tooth).map((d) => ({ id: d.id, name: d.name, url: URL.createObjectURL(d.blob), image: d.type.startsWith('image/') })));
  }
}
