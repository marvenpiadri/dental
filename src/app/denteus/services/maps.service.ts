import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { PLACE_FIELDS, PlaceResult } from '../rules/places-rules';
import { MapsLink, isShortLink, parseMapsLink } from '../rules/maps-link';

export interface Suggestion { placeId: string; text: string }

/**
 * Google Places boundary. The browser key comes from `<meta name="dontalist-maps-key">` in index.html, set at deploy time;
 * it must be restricted by HTTP referrer and to the Places API. Without a key `available` is false and nothing is requested.
 * Autocomplete is only called while the owner types in the location field; public pages never call Places.
 * shortcut: untested against the live API (no key in development); verify with a real restricted key before release.
 */
@Injectable({ providedIn: 'root' })
export class MapsService {
  private readonly doc = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly key = this.browser ? (this.doc.querySelector('meta[name="dontalist-maps-key"]')?.getAttribute('content') ?? '').trim() : '';
  readonly available = this.key.length > 0;
  private library?: Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  private token?: unknown;

  private load(): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
    this.library ??= new Promise((done, fail) => {
      const w = window as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (w.google?.maps?.importLibrary) { done(w.google.maps.importLibrary('places')); return; }
      w.__dontalistMaps = () => done(w.google.maps.importLibrary('places'));
      const s = this.doc.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(this.key)}&loading=async&v=weekly&callback=__dontalistMaps`;
      s.async = true; s.onerror = () => fail(new Error('maps'));
      this.doc.head.appendChild(s);
    });
    return this.library;
  }

  /**
   * Reads a pasted Google Maps link. The server follows short links and, when it has a geocoding key, adds the address;
   * if the server can't be reached a full link is still read here, so coordinates always work.
   */
  async fromLink(raw: string, lang: string): Promise<{ link: MapsLink; geo?: PlaceResult } | null> {
    try {
      const res = await fetch(`/api/maps-link?u=${encodeURIComponent(raw)}&lang=${lang}`);
      if (res.ok) { const { geo, address: _a, ...link } = (await res.json()) as MapsLink & { geo?: PlaceResult; address?: string }; return { link, geo }; }
      if (res.status === 422 || res.status === 429) return null;
    } catch { /* offline: fall through to the local reading */ }
    let url: URL | null = null;
    try { url = new URL(raw.trim()); } catch { return null; }
    const link = isShortLink(url) ? null : parseMapsLink(raw);
    return link ? { link } : null;
  }

  /** Autocomplete suggestions for establishments and addresses. One session token per search keeps billing to one session. */
  async search(input: string): Promise<Suggestion[]> {
    if (!this.available || input.trim().length < 3) return [];
    const lib = await this.load();
    this.token ??= new lib.AutocompleteSessionToken();
    const { suggestions } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input, sessionToken: this.token });
    return suggestions.filter((s: any) => s.placePrediction).map((s: any) => ({ placeId: s.placePrediction.placeId, text: s.placePrediction.text.toString() })); // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  /** Place Details with the field mask only; ends the session. */
  async details(placeId: string): Promise<PlaceResult> {
    const lib = await this.load();
    const place = new lib.Place({ id: placeId });
    await place.fetchFields({ fields: [...PLACE_FIELDS] });
    this.token = undefined;
    return { id: place.id, displayName: place.displayName, formattedAddress: place.formattedAddress, location: place.location ? { lat: place.location.lat(), lng: place.location.lng() } : undefined, addressComponents: place.addressComponents };
  }
}
