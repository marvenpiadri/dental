import { Injectable, DOCUMENT, effect, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { SiteService } from './site-service';
import { SITE_URL, LANGS } from './site';

/** Title, description, canonical and hreflang links for one page, in the page's language. */
@Injectable({ providedIn: 'root' })
export class Seo {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly doc = inject(DOCUMENT);
  private readonly site = inject(SiteService);

  set(read: () => { title: string; description: string }, path: string): void {
    effect(() => {
      const { title, description } = read(), lang = this.site.lang(), url = `${SITE_URL}/${lang}${path ? '/' + path : ''}`;
      this.title.setTitle(title);
      this.meta.updateTag({ name: 'description', content: description });
      this.meta.updateTag({ property: 'og:title', content: title });
      this.meta.updateTag({ property: 'og:description', content: description });
      this.meta.updateTag({ property: 'og:url', content: url });
      this.meta.updateTag({ property: 'og:image', content: `${SITE_URL}/og.jpg` });
      this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
      this.link('canonical', url);
      for (const l of LANGS) this.link('alternate', `${SITE_URL}/${l}${path ? '/' + path : ''}`, l);
    });
  }
  private link(rel: string, href: string, hreflang?: string): void {
    const sel = hreflang ? `link[rel="${rel}"][hreflang="${hreflang}"]` : `link[rel="${rel}"]`;
    let el = this.doc.head.querySelector<HTMLLinkElement>(sel);
    if (!el) { el = this.doc.createElement('link'); el.rel = rel; if (hreflang) el.hreflang = hreflang; this.doc.head.appendChild(el); }
    el.href = href;
  }
}
