import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type Template = 11 | 13 | 14 | 16;
/** Premolars and molars also have a top-down (occlusal) drawing; front teeth do not and keep the front one. */
export type ArtKey = '11' | '13' | '14' | '16' | '14_occl' | '16_occl';
const KEYS: ArtKey[] = ['11', '13', '14', '16', '14_occl', '16_occl'];
export const artKey = (tpl: Template, occlusal: boolean): ArtKey => (occlusal && (tpl === 14 || tpl === 16) ? (`${tpl}_occl` as ArtKey) : (String(tpl) as ArtKey));

/** Tooth artwork (SVG text), fetched once from /odontogram/teeth and shared. Browser-only: the server renders no teeth. */
@Injectable({ providedIn: 'root' })
export class ToothArt {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly texts = signal<Partial<Record<ArtKey, string>>>({});
  private readonly pending = new Set<ArtKey>();

  load(): void {
    if (!this.browser) return;
    for (const tpl of KEYS) {
      if (this.pending.has(tpl) || this.texts()[tpl]) continue;
      this.pending.add(tpl);
      fetch(`/odontogram/teeth/${tpl}.svg`)
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
        .then((text) => this.texts.update((t) => ({ ...t, [tpl]: text })))
        .catch(() => this.pending.delete(tpl)); // shortcut: retried on the next load() call; no offline cache yet
    }
  }
}
