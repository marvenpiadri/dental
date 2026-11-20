import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_CONFIG } from './api-config';

/** What GET /v1/auth/me says about the signed-in person. The cookie is HttpOnly: nothing secret reaches the page, and every call is checked again on the server. */
export interface Me { id: string; clinicId: string; name: string; role: string; permissions: string[] }

@Injectable({ providedIn: 'root' })
export class ApiSession {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_CONFIG).url;
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  /** False in local mode (no backend address configured). */
  readonly enabled = this.base !== '';
  private readonly _who = signal<Me | null>(null);
  readonly who = this._who.asReadonly();
  readonly signedIn = computed(() => this._who() !== null);

  /** Full address of an API path, for example url('/patients') -> https://api.example.com/v1/patients. */
  url = (path: string): string => `${this.base}/v1${path}`;
  /** True for requests that go to the backend. */
  isApi = (url: string): boolean => this.enabled && url.startsWith(`${this.base}/v1/`);
  can = (permission: string): boolean => !!this._who()?.permissions.includes(permission);

  async refresh(): Promise<void> {
    if (!this.enabled || !this.browser) return;
    try { this._who.set(await firstValueFrom(this.http.get<Me>(this.url('/auth/me')))); } catch { this._who.set(null); }
  }
  async login(email: string, password: string): Promise<void> {
    await firstValueFrom(this.http.post(this.url('/auth/login'), { email, password }));
    await this.refresh();
    if (!this._who()) throw new Error('signed in but the session was not kept (check cookie and CORS settings)');
  }
  async logout(): Promise<void> {
    try { await firstValueFrom(this.http.post(this.url('/auth/logout'), {})); } finally { this._who.set(null); }
  }
  /** Called by the interceptor when the server says the session is gone (expired, revoked, suspended). */
  expired(): void { this._who.set(null); }
}
