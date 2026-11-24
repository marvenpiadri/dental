import { Component, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { isLang } from '../core/site';

/** `/`: sends a returning visitor to their saved language, a new one to the browser's language, and shows both choices if scripts are off. */
@Component({
  selector: 'ds-choose-language',
  template: `<main class="choose"><img src="logo.png" alt="" width="56" height="56"><h1>Dontalist</h1><p><a href="/en/">English</a><a href="/fr/">Français</a></p></main>`,
})
export class ChooseLanguage {
  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    let saved: string | null = null;
    try { saved = localStorage.getItem('ds-lang'); } catch { /* private mode */ }
    const pick = isLang(saved) ? saved : navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
    void inject(Router).navigate(['/', pick], { replaceUrl: true });
  }
}
