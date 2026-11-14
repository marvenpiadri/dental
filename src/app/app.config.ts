import { inject, isDevMode, provideAppInitializer } from '@angular/core';
import { I18n } from './core/i18n/i18n.service';
import { provideServiceWorker } from '@angular/service-worker';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { PageTitle } from './core/page-title';
import { routes } from './app.routes';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { apiInterceptor } from './core/api/api.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Same-origin calls to /api/v1 with the HttpOnly session cookie; see core/api. The screens still read their data from this browser until they are moved over.
    provideHttpClient(withFetch(), withInterceptors([apiInterceptor])),
    provideAppInitializer(() => inject(I18n).ready()),
    // Query parameters (?date=...&patient=...) arrive as component inputs.
    provideRouter(routes, withComponentInputBinding()),
    { provide: TitleStrategy, useExisting: PageTitle },
    // Replays clicks made before the page finished hydrating, so a fast receptionist never loses one.
    provideClientHydration(withEventReplay()),
    // Offline use: the data is local (IndexedDB), so caching the app shell is all it takes. Disabled in dev so edits show up.
    provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode(), registrationStrategy: 'registerWhenStable:30000' }),
  ],
};
