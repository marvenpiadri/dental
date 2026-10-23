import { DOCUMENT } from '@angular/common';
import { Injectable, REQUEST, effect, inject, signal } from '@angular/core';
import { readCookie } from '../cookie';
import { en } from './en';
import { fr } from './fr';

export type Key = keyof typeof en;
export type Lang = 'en' | 'fr';

/** Adding a language: add a file like fr.ts (the compiler lists every missing key), then one line here. */
export const LANGS: readonly { code: Lang; label: string; short: string; dir: 'ltr' | 'rtl' }[] = [
  { code: 'en', label: 'English', short: 'EN', dir: 'ltr' },
  { code: 'fr', label: 'Français', short: 'FR', dir: 'ltr' },
];

const DICTIONARIES: Record<Lang, Record<Key, string>> = { en, fr };
const COOKIE = 'dtl-lang';

const isLang = (value: unknown): value is Lang => LANGS.some((l) => l.code === value);

/**
 * Runtime translations. A cookie (not localStorage) holds the choice so the server renders the right
 * language in the first byte. With no cookie the server follows the browser's Accept-Language header,
 * and the browser follows what the server rendered, so the two never disagree.
 *
 * In templates call `t('key')` or `t('key', { n: 3 })`: the call reads a signal, so the view updates
 * when the language changes.
 */
@Injectable({ providedIn: 'root' })
export class I18n {
  private readonly doc = inject(DOCUMENT);
  private readonly request = inject(REQUEST, { optional: true });

  readonly lang = signal<Lang>(this.initial());

  constructor() {
    effect(() => {
      const meta = LANGS.find((l) => l.code === this.lang())!;
      this.doc.documentElement.setAttribute('lang', meta.code);
      this.doc.documentElement.setAttribute('dir', meta.dir);
    });
  }

  readonly t = (key: Key, params?: Record<string, string | number>): string => {
    let text = DICTIONARIES[this.lang()][key] ?? en[key];
    if (params) for (const [name, value] of Object.entries(params)) text = text.replaceAll(`{${name}}`, String(value));
    return text;
  };

  /** Picks `<base>.one` / `<base>.other` (or the language's other plural forms) for a count. */
  readonly tn = (base: string, n: number): string => {
    const form = new Intl.PluralRules(this.lang()).select(n);
    const key = (`${base}.${form}` in en ? `${base}.${form}` : `${base}.other`) as Key;
    return this.t(key, { n });
  };

  setLang(lang: Lang): void {
    this.lang.set(lang);
    this.doc.cookie = `${COOKIE}=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }

  date(value: Date, options: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat(this.lang(), options).format(value);
  }

  /** 24-hour clock, the same in every language a clinic here would use. */
  /** shortcut: the clinic's currency is fixed to MAD, move it to clinic setup for clinics elsewhere. */
  money(amount: number): string {
    return new Intl.NumberFormat(this.lang(), { style: 'currency', currency: 'MAD', maximumFractionDigits: 0 }).format(amount);
  }

  time(value: Date): string {
    return new Intl.DateTimeFormat(this.lang(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value);
  }

  private initial(): Lang {
    const saved = readCookie(this.doc, this.request, COOKIE, '[a-z]{2}');
    if (isLang(saved)) return saved;
    if (this.request) {
      // Accept-Language looks like "fr-MA,fr;q=0.9,en;q=0.8": take the first language we support.
      const header = this.request.headers.get('accept-language') ?? '';
      for (const part of header.split(',')) {
        const code = part.trim().slice(0, 2).toLowerCase();
        if (isLang(code)) return code;
      }
      return 'en';
    }
    const rendered = this.doc.documentElement.getAttribute('lang');
    return isLang(rendered) ? rendered : 'en';
  }
}
