import { ChangeDetectionStrategy, Component, OnDestroy, forwardRef, inject, input, output, signal } from '@angular/core';
import {
  ODONTOGRAM_ENGINE_LIFECYCLE,
  NumberingSystem,
  OdontogramThemeConfig,
  OdontogramShellComponent,
  destroyOdontogram,
  getStatusChart,
  importStatus,
  initOdontogram,
  onStateChange,
  setPatientDob,
  setPatientName,
} from 'angular-advanced-odontogram';
import { I18n } from '../../core/i18n/i18n.service';
import { ThemeService } from '../../core/theme.service';

/**
 * The patient's odontogram: the library's own shell (chart, tooth editor, perio chart, plan chart, exports),
 * loaded and saved per patient. The library keeps one chart per page, so this component is the only
 * place that touches its engine: it loads the patient's saved chart after the engine starts and saves
 * the chart back (debounced) whenever the dentist changes it.
 * shortcut: the library is browser-only and keeps module-level state, so only one patient's chart can be open at a time.
 */
@Component({
  selector: 'den-odontogram',
  imports: [OdontogramShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The library calls this lifecycle instead of starting and stopping the engine itself (a documented seam).
  providers: [{ provide: ODONTOGRAM_ENGINE_LIFECYCLE, useFactory: () => {
    const host = inject(forwardRef(() => PatientOdontogramComponent));
    return { init: () => host.start(), destroy: () => host.stop() };
  } }],
  template: `
    <aao-odontogram-shell
      [language]="lang()"
      [numberingSystem]="numbering()"
      [darkMode]="theme.theme() === 'dark'"
      [themeConfig]="themeConfig"
      [enableNotes]="true"
      (languageChange)="setLang($event)"
      (numberingChange)="numbering.set($event)"
      (darkModeChange)="setDark($event)" />`,
  styles: ':host { display: block; }',
})
export class PatientOdontogramComponent implements OnDestroy {
  readonly patientName = input('');
  readonly birthDate = input<string | undefined>();
  /** The chart saved for this patient, read once when the engine starts. */
  readonly chart = input<unknown>();
  readonly save = output<unknown>();

  protected readonly i18n = inject(I18n);
  protected readonly theme = inject(ThemeService);
  /** The library's surfaces follow the CRM's colours (these are CSS variables, so light and dark both follow). */
  protected readonly themeConfig: OdontogramThemeConfig = {
    colors: { background: 'var(--app-subtle)', panel: 'var(--app-panel)', card: 'var(--app-panel)', text: 'var(--app-text)', muted: 'var(--app-muted)', line: 'var(--app-line)' },
  };
  protected readonly numbering = signal<NumberingSystem>('FDI');
  protected readonly lang = this.i18n.lang;

  private last = '';
  private timer?: ReturnType<typeof setTimeout>;
  private unsubscribe?: () => void;

  protected setLang(lang: string): void {
    if (lang === 'en' || lang === 'fr') this.i18n.setLang(lang); // the CRM speaks these two
  }

  protected setDark(dark: boolean): void {
    if (dark !== (this.theme.theme() === 'dark')) this.theme.toggle();
  }

  async start(): Promise<void> {
    await initOdontogram();
    const saved = this.chart();
    if (saved) importStatus(structuredClone(saved));
    setPatientName(this.patientName());
    setPatientDob(this.birthDate() ?? '');
    this.last = JSON.stringify(getStatusChart());
    this.unsubscribe = onStateChange(() => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), 500);
    });
  }

  stop(): void {
    this.flush();
    this.unsubscribe?.();
    destroyOdontogram();
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }

  /** Emits the chart only when it differs from what was last saved. */
  private flush(): void {
    clearTimeout(this.timer);
    const json = JSON.stringify(getStatusChart());
    if (json === this.last) return;
    this.last = json;
    this.save.emit(JSON.parse(json));
  }
}
