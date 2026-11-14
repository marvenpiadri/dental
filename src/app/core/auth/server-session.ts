import { InjectionToken } from '@angular/core';

/** What the server verified about the visitor before rendering: null when signed out (or in the browser). Carries no secret; the cookie itself never reaches Angular. */
export interface ServerSession { staffId: string; clinicId: string; name: string; role: string; permissions: string[]; csrf: string }
export const SERVER_SESSION = new InjectionToken<ServerSession | null>('SERVER_SESSION', { providedIn: 'root', factory: () => null });
