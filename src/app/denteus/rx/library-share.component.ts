import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { I18n, Key } from '../../core/i18n/i18n.service';
import { DuplicateChoice, ImportRow, LibraryPackage, LibraryPart, ParseError, exportLibrary, parseLibrary, resolveImport } from './library-io';
import { RxLibrary } from './rx-library.service';

/** Appears in this build's package.json as "version"; kept here so exported files say which Dontalist wrote them. */
export const APP_VERSION = '1.0';

/** Export the libraries as JSON; import another clinic's file after inspecting a preview. Imports only add. */
@Component({
  selector: 'den-library-share',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card" aria-labelledby="sh-title">
      <header class="card-head"><h2 class="card-title" id="sh-title"><i class="fa-solid fa-file-export" aria-hidden="true"></i>{{ t('share.title') }}</h2></header>
      <div class="body">
        <p class="hint">{{ t('share.intro') }}</p>
        <div class="row">
          <button type="button" class="btn btn--primary" (click)="download(['medications', 'allergies', 'templates'], 'all')">{{ t('share.export.all') }}</button>
          <button type="button" class="btn" (click)="download(['medications'], 'medications')">{{ t('share.export.med') }}</button>
          <button type="button" class="btn" (click)="download(['allergies'], 'allergies')">{{ t('share.export.alg') }}</button>
          <button type="button" class="btn" (click)="download(['templates'], 'prescriptions')">{{ t('share.export.tpl') }}</button>
        </div>
        @if (lib.canEdit) {
          <div class="row pad"><label class="btn"><i class="fa-solid fa-file-import" aria-hidden="true"></i>{{ t('share.import') }}<input type="file" accept="application/json,.json" hidden (change)="choose($event)" /></label></div>
        }
        @if (error()) { <p class="error" role="alert">{{ t(errKey[error()!]) }}</p> }
        @if (pkg(); as p) {
          <section class="preview" aria-live="polite">
            <h3>{{ t('share.preview') }}</h3>
            <p class="hint">{{ t('share.file', { version: p.appVersion || '?', date: p.exportedAt ? p.exportedAt.slice(0, 10) : '?' }) }}</p>
            @if (rejected()) { <p class="hint">{{ t('share.rejected', { n: rejected() }) }}</p> }
            <p>{{ t('share.summary', { m: result().added.medications, a: result().added.allergies, t: result().added.templates }) }}</p>
            <ul class="rows">
              @for (r of result().rows; track r.kind + r.id) {
                <li>
                  <span class="chip">{{ t(kindKey[r.kind]) }}</span> <strong>{{ r.name }}</strong> <span class="muted">{{ t(statusKey[r.status]) }}</span>
                  @if (r.status === 'duplicate' || (choices()[r.id] === 'existing' && r.existingId)) {
                    <select class="input small" [attr.aria-label]="r.name" (change)="choose1(r.id, $any($event.target).value)">
                      <option value="separate" [selected]="(choices()[r.id] ?? 'separate') === 'separate'">{{ t('share.choice.separate') }}</option>
                      <option value="existing" [selected]="choices()[r.id] === 'existing'">{{ t('share.choice.existing') }}</option>
                    </select>
                  }
                </li>
              }
            </ul>
            @if (result().missing.length) {
              <h4>{{ t('share.missing') }}</h4>
              <ul class="rows">@for (m of result().missing; track $index) { <li>{{ t(missKey[m.kind], { owner: m.owner, detail: m.detail }) }}</li> }</ul>
            }
            <div class="row"><button type="button" class="btn btn--primary" [disabled]="total() === 0" (click)="apply()">{{ t('share.go', { n: total() }) }}</button><button type="button" class="btn" (click)="reset()">{{ t('share.cancel') }}</button></div>
          </section>
        }
        @if (done()) { <p class="hint" role="status">{{ done() }}</p> }
      </div>
    </section>
  `,
  styles: `
    :host { display: block; } .body { padding: 16px; } .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; } .pad { margin-top: 12px; }
    .hint, .muted { color: var(--app-muted); font-size: 13px; } .error { color: var(--app-danger); font-size: 13px; }
    .preview { margin-top: 16px; padding: 12px; border: 1px solid var(--app-line); border-radius: 8px; } .preview h3, .preview h4 { margin: 0 0 6px; font-size: 14px; }
    .rows { list-style: none; margin: 8px 0; padding: 0; max-height: 320px; overflow: auto; } .rows li { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 4px 0; border-top: 1px solid var(--app-line); font-size: 13px; } .small { max-width: 240px; }
  `,
})
export class LibraryShareComponent {
  protected readonly lib = inject(RxLibrary);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly errKey: Record<ParseError, Key> = { size: 'share.err.size', json: 'share.err.json', format: 'share.err.format', version: 'share.err.version' };
  protected readonly kindKey = { medication: 'share.kind.medication', allergy: 'share.kind.allergy', template: 'share.kind.template' } as const satisfies Record<ImportRow['kind'], Key>;
  protected readonly statusKey = { new: 'share.st.new', same: 'share.st.same', duplicate: 'share.st.duplicate', idRemapped: 'share.st.idRemapped', blocked: 'share.st.blocked' } as const satisfies Record<ImportRow['status'], Key>;
  protected readonly missKey = { genericBrand: 'share.m.genericBrand', allergyMedication: 'share.m.allergyMedication', templateMedication: 'share.m.templateMedication', templateAlert: 'share.m.templateAlert' } as const;
  protected readonly error = signal<ParseError | null>(null);
  protected readonly pkg = signal<LibraryPackage | null>(null);
  protected readonly rejected = signal(0);
  protected readonly choices = signal<Record<string, DuplicateChoice>>({});
  protected readonly done = signal('');
  private readonly libs = computed(() => ({ medications: this.lib.medications(), allergies: this.lib.allergies(), templates: this.lib.templates() }));
  protected readonly result = computed(() => resolveImport(this.libs(), this.pkg()!, this.choices(), () => crypto.randomUUID()));
  protected readonly total = computed(() => { const a = this.result().added; return a.medications + a.allergies + a.templates; });

  protected download(parts: LibraryPart[], name: string): void {
    const json = JSON.stringify(exportLibrary(parts, this.libs(), APP_VERSION, new Date().toISOString()), null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = `dontalist-${name}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  protected async choose(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    this.reset();
    if (!file) return;
    const r = parseLibrary(file.size > 5_000_000 ? ' '.repeat(5_000_001) : await file.text());
    if (!r.ok) { this.error.set(r.error); return; }
    this.rejected.set(r.rejected);
    this.pkg.set(r.pkg);
  }
  protected choose1(id: string, v: DuplicateChoice): void { this.choices.update((c) => ({ ...c, [id]: v })); }
  protected reset(): void { this.pkg.set(null); this.error.set(null); this.choices.set({}); this.rejected.set(0); this.done.set(''); }
  protected async apply(): Promise<void> {
    const r = this.result();
    await this.lib.replaceLibraries(r.libraries.medications, r.libraries.allergies, r.libraries.templates);
    this.reset();
    this.done.set(this.t('share.done', { m: r.added.medications, a: r.added.allergies, t: r.added.templates }));
  }
}
