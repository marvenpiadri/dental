import { PLATFORM_ID, RESPONSE_INIT, TransferState, inject, makeStateKey } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { Router, ResolveFn } from '@angular/router';
import { PublicLookup, lookup } from '../rules/public-record';
import { PUBLIC_CLINICS } from './public-source';

/** Looks the clinic up on the server (and sends 404 or a permanent redirect with the page); the browser reuses that answer. */
export const publicClinic: ResolveFn<PublicLookup> = async (route) => {
  const { country, city, slug } = route.params as Record<string, string>;
  const state = inject(TransferState);
  const key = makeStateKey<PublicLookup>(`clinic:${country}/${city}/${slug}`);
  const router = inject(Router);
  const init = inject(RESPONSE_INIT, { optional: true });
  const load = inject(PUBLIC_CLINICS);
  const server = isPlatformServer(inject(PLATFORM_ID));
  let result: PublicLookup;
  if (state.hasKey(key)) result = state.get(key, { kind: 'none' });
  else if (server) { result = lookup(await load(), country, city, slug); state.set(key, result); }
  else result = { kind: 'none' };

  if (init && result.kind === 'none') init.status = 404;
  if (init && result.kind === 'redirect') { const h = new Headers(init.headers); h.set('Location', result.to); init.headers = h; init.status = 301; }
  if (result.kind === 'redirect' && !init) void router.navigateByUrl(result.to);
  return result;
};
