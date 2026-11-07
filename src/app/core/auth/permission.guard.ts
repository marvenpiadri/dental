import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { Permission } from './auth-rules';

/** Route data `{ permission }` (one) or `{ anyOf }` (any of several): people without it go to the first page their role can open. */
export const permissionGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const router = inject(Router); // inject() only works before the first await
  await auth.init();
  const needed = route.data['permission'] as Permission | undefined;
  const anyOf = route.data['anyOf'] as Permission[] | undefined;
  if ((!needed || auth.can(needed)) && (!anyOf || auth.canAny(...anyOf))) return true;
  return router.parseUrl(auth.can('appointments.view') ? '/today' : auth.can('patients.view') ? '/patients' : '/reports');
};
