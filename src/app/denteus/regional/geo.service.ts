import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * City names, one small file per country (`geo/MA.json`), fetched only when a form needs that country and kept for the session.
 * Offline or unknown country: an empty list, and the form falls back to typing the place by hand.
 */
@Injectable({ providedIn: 'root' })
export class GeoService {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly cache = new Map<string, Promise<string[]>>();

  cities(country: string | undefined): Promise<string[]> {
    const code = country?.toUpperCase();
    if (!code || !/^[A-Z]{2}$/.test(code) || !this.browser) return Promise.resolve([]);
    let hit = this.cache.get(code);
    if (!hit) {
      hit = fetch(`geo/${code}.json`)
        .then((r) => (r.ok ? r.json() : []))
        .then((list: unknown) => (Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []))
        .catch(() => { this.cache.delete(code); return []; });
      this.cache.set(code, hit);
    }
    return hit;
  }
}
