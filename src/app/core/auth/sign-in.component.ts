import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { I18n } from '../i18n/i18n.service';
import { Key } from '../i18n/i18n.service';
import { AuthService } from './auth.service';
import { Role } from './auth-rules';

export const ROLE_KEY: Record<Role, Key> = { owner: 'team.role.owner', dentist: 'team.role.dentist', reception: 'team.role.reception' };

@Component({
  selector: 'den-sign-in',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="box" (submit)="$event.preventDefault(); go(who.value, pin.value); pin.value = ''">
      <span class="logo">D<span>.</span></span>
      <h1>{{ t('auth.title') }}</h1>
      <label class="field">
        <span class="label">{{ t('auth.who') }}</span>
        <select class="input" #who>
          @for (s of auth.staff(); track s.id) { <option [value]="s.id">{{ s.name }} · {{ t(roleKey[s.role]) }}</option> }
        </select>
      </label>
      <label class="field">
        <span class="label">{{ t('auth.pin') }}</span>
        <input class="input" #pin type="password" inputmode="numeric" autocomplete="off" maxlength="8" [attr.aria-invalid]="wrong()" />
      </label>
      @if (wrong()) { <p class="error-text" role="alert">{{ t('auth.wrong') }}</p> }
      <button class="btn btn--primary" type="submit">{{ t('auth.signin') }}</button>
    </form>`,
  styles: `
    :host { display: grid; place-items: center; height: 100%; background: var(--app-canvas); padding: 16px; }
    .box { display: grid; gap: 14px; width: min(360px, 100%); padding: 28px; border: 1px solid var(--app-line); border-radius: var(--radius-card); background: var(--app-panel); }
    h1 { margin: 0; font-size: 17px; }
    .logo { font-size: 22px; font-weight: 750; } .logo span { color: var(--app-muted); }`,
})
export class SignInComponent {
  protected readonly auth = inject(AuthService);
  protected readonly t = inject(I18n).t;
  protected readonly roleKey = ROLE_KEY;
  protected readonly wrong = signal(false);

  protected async go(id: string, pin: string): Promise<void> {
    this.wrong.set(!(await this.auth.signIn(id, pin)));
  }
}
