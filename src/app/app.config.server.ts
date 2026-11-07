import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { PUBLIC_CLINICS, SITE_ORIGIN } from './denteus/public/public-source';
import { loadPublicClinics, siteOrigin } from '../public-source.server';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    { provide: PUBLIC_CLINICS, useValue: loadPublicClinics },
    { provide: SITE_ORIGIN, useFactory: siteOrigin },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
