import { InjectionToken } from '@angular/core';
import { PublicClinic } from '../rules/public-record';

/** Where public clinic records come from. The browser has none (they arrive through TransferState); the server reads them through its own loader. */
export const PUBLIC_CLINICS = new InjectionToken<() => Promise<PublicClinic[]>>('PUBLIC_CLINICS', { providedIn: 'root', factory: () => () => Promise.resolve([]) });

/** The site's address for canonical links and the sitemap. Set `DONTALIST_ORIGIN` on the server. */
export const SITE_ORIGIN = new InjectionToken<string>('SITE_ORIGIN', { providedIn: 'root', factory: () => 'https://dontalist.com' });
