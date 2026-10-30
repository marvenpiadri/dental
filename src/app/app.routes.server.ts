import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Pages are rendered per request, not prerendered: they will sit behind a sign-in and depend on the
 * visitor's cookies (theme and language today, session later). What the server sends is the frame;
 * browser-only content (IndexedDB data, the clock) is filled in after hydration. See DESIGN.md.
 */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Server },
  { path: 'today', renderMode: RenderMode.Server },
  { path: 'calendar', renderMode: RenderMode.Server },
  { path: 'patients', renderMode: RenderMode.Server },
  { path: 'patients/new', renderMode: RenderMode.Server },
  { path: 'patients/:id', renderMode: RenderMode.Server },
  { path: 'patients/:id/edit', renderMode: RenderMode.Server },
  { path: 'patients/:id/:page', renderMode: RenderMode.Server },
  { path: 'practice', renderMode: RenderMode.Server },
  { path: 'reports', renderMode: RenderMode.Server },
  { path: 'setup', renderMode: RenderMode.Server },
  { path: '**', renderMode: RenderMode.Server, status: 404 },
];
