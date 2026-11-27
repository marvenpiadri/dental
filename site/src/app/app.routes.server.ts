import { RenderMode, ServerRoute } from '@angular/ssr';

const params = async () => [{ lang: 'en' }, { lang: 'fr' }];
const page = (path: string): ServerRoute => ({ path, renderMode: RenderMode.Prerender, getPrerenderParams: params });

export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  page(':lang'), page(':lang/partnership'), page(':lang/about'),
  { path: '**', renderMode: RenderMode.Client },
];
