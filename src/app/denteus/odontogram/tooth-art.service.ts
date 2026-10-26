import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type Template = 11 | 13 | 14 | 16;
const FILES: Record<Template, string> = { 11: '11', 13: '13', 14: '14', 16: '16' };

/** Tooth artwork (SVG text), fetched once from /odontogram/teeth and shared. Browser-only: the server renders no teeth. */
@Injectable({ providedIn: 'root' })
export class ToothArt {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly texts = signal<Partial<Record<Template, string>>>({});
  private readonly pending = new Set<Template>();

  load(): void {
    if (!this.browser) return;
    for (const tpl of Object.keys(FILES).map(Number) as Template[]) {
      if (this.pending.has(tpl) || this.texts()[tpl]) continue;
      this.pending.add(tpl);
      fetch(`/odontogram/teeth/${FILES[tpl]}.svg`)
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
        .then((text) => this.texts.update((t) => ({ ...t, [tpl]: text })))
        .catch(() => this.pending.delete(tpl)); // shortcut: retried on the next load() call; no offline cache yet
    }
  }
}
