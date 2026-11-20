import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { API_CONFIG, readApiConfig } from './app/core/api/api-config';

readApiConfig()
  .then((api) => bootstrapApplication(App, { ...appConfig, providers: [...appConfig.providers, { provide: API_CONFIG, useValue: api }] }))
  .catch((err) => console.error(err));
