import { Injectable, computed, signal } from '@angular/core';
import type { Lang } from './site';

@Injectable({ providedIn: 'root' })
export class SiteService {
  readonly lang = signal<Lang>('en');
  /** Picks the current language out of a `{ en, fr }` pair. */
  pick<T>(pair: { en: T; fr: T }) { return computed(() => pair[this.lang()]); }
}
export const pair = <T,>(en: T, fr: T): { en: T; fr: T } => ({ en, fr });
