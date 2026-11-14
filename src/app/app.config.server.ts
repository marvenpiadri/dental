import { mergeApplicationConfig, ApplicationConfig, REQUEST_CONTEXT, inject } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { PUBLIC_CLINICS, SITE_ORIGIN } from './denteus/public/public-source';
import { SERVER_SESSION } from './core/auth/server-session';
import type { SsrContext } from '../worker/env';

/** The Worker hands each render its own context (verified session, origin, clinic loader); nothing is read from process or module state. */
const ctx = () => inject(REQUEST_CONTEXT, { optional: true }) as SsrContext | null;
const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    { provide: PUBLIC_CLINICS, useFactory: () => ctx()?.loadClinics ?? (() => Promise.resolve([])) },
    { provide: SITE_ORIGIN, useFactory: () => ctx()?.origin ?? 'https://dontalist.com' },
    { provide: SERVER_SESSION, useFactory: () => ctx()?.session ?? null },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
