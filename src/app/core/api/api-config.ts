import { InjectionToken } from '@angular/core';

/**
 * Where the backend lives, read at start-up from /config.json (so one build serves test and live: only that file differs).
 * An empty address means "local mode": no backend, the app keeps using this browser's storage. Cleared in stage S8 when storage moves fully to the server.
 */
export interface ApiConfig { url: string }
export const API_CONFIG = new InjectionToken<ApiConfig>('API_CONFIG', { providedIn: 'root', factory: () => ({ url: '' }) });

export const readApiConfig = async (): Promise<ApiConfig> => {
  try {
    const r = await fetch('/config.json', { cache: 'no-store' });
    const url = r.ok ? String(((await r.json()) as { apiUrl?: unknown }).apiUrl ?? '').trim().replace(/\/+$/, '') : '';
    return { url: /^https?:\/\//.test(url) ? url : '' };
  } catch { return { url: '' }; }
};
