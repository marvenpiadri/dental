import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { PageTitle } from './core/page-title';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Query parameters (?date=...&patient=...) arrive as component inputs.
    provideRouter(routes, withComponentInputBinding()),
    { provide: TitleStrategy, useExisting: PageTitle },
    // Replays clicks made before the page finished hydrating, so a fast receptionist never loses one.
    provideClientHydration(withEventReplay()),
  ],
};
