import { ChangeDetectionStrategy, Component, OnInit, effect, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth.service';
import { SignInComponent } from './core/auth/sign-in.component';
import { I18n, LANGS, Lang } from './core/i18n/i18n.service';
import { ThemeService } from './core/theme.service';
import { DentalStore } from './denteus/services/dental-store.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, SignInComponent],
  providers: [DentalStore],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnInit {
  protected readonly themeService = inject(ThemeService);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  private readonly store = inject(DentalStore);

  /** The next language in the list: with two languages the button flips between them. */
  protected nextLang(): Lang {
    const codes = LANGS.map((l) => l.code);
    return codes[(codes.indexOf(this.i18n.lang()) + 1) % codes.length];
  }

  protected nextLangLabel(): string {
    return LANGS.find((l) => l.code === this.nextLang())!.label;
  }

  protected nextLangShort(): string {
    return LANGS.find((l) => l.code === this.nextLang())!.short;
  }

  protected readonly auth = inject(AuthService);
  /** Appointment history shows who did what: the signed-in person, or the front desk while the app is open. */
  private readonly actor = effect(() => this.store.actor.set(this.auth.user()?.name ?? 'Front desk'));

  ngOnInit(): void {
    this.auth.init();
    // Load the clinic's records once for every page; failures show as store.loadFailed().
    this.store.init().catch(() => undefined);
  }
}
