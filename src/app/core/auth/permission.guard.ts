import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { Permission } from './auth-rules';

/** Route data `{ permission }`: people without it are sent to Today. */
export const permissionGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const router = inject(Router); // inject() only works before the first await
  await auth.init();
  const needed = route.data['permission'] as Permission | undefined;
  return !needed || auth.can(needed) || router.parseUrl('/today');
};
