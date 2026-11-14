import { Injectable, PLATFORM_ID, TransferState, computed, inject, makeStateKey, signal } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { SERVER_SESSION, ServerSession } from '../auth/server-session';

export const API = '/api/v1';
const KEY = makeStateKey<ServerSession | null>('server-session');

/**
 * The signed-in person as the SERVER verified them. The cookie is HttpOnly, so this holds only what the server chose to tell the page
 * (name, role, permissions, a CSRF token) and keeps it in memory: nothing here is written to storage and none of it grants anything on its own.
 * Every API call is checked again on the server.
 */
@Injectable({ providedIn: 'root' })
export class ApiSession {
  private readonly http = inject(HttpClient);
  private readonly state = inject(TransferState);
  private readonly _who = signal<ServerSession | null>(this.initial());
  readonly who = this._who.asReadonly();
  readonly signedIn = computed(() => this._who() !== null);
  /** Sent as X-CSRF-Token on every state-changing call (see api.interceptor). */
  csrf = (): string | null => this._who()?.csrf ?? null;
  can = (permission: string): boolean => !!this._who()?.permissions.includes(permission);

  private initial(): ServerSession | null {
    if (isPlatformServer(inject(PLATFORM_ID))) { const s = inject(SERVER_SESSION); this.state.set(KEY, s); return s; }
    return this.state.get(KEY, null);
  }
  async refresh(): Promise<void> {
    try { this._who.set((await firstValueFrom(this.http.get<{ session: ServerSession }>(`${API}/auth/me`))).session); } catch { this._who.set(null); }
  }
  async login(email: string, password: string): Promise<void> {
    this._who.set((await firstValueFrom(this.http.post<{ session: ServerSession }>(`${API}/auth/login`, { email, password }))).session);
  }
  async logout(): Promise<void> {
    try { await firstValueFrom(this.http.post(`${API}/auth/logout`, {})); } finally { this._who.set(null); }
  }
  /** Called by the interceptor when the server says the session is gone (expired, revoked, suspended). */
  expired(): void { this._who.set(null); }
}
