import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ApiSession } from './api-session.service';

/** Backend calls only: send the cookie, add the CSRF header the API requires on writes, and drop the local session when the server says it is over. */
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(ApiSession);
  if (!session.isApi(req.url)) return next(req);
  const write = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  const out = req.clone({ withCredentials: true, setHeaders: write ? { 'x-dontalist-csrf': '1' } : {} });
  return next(out).pipe(catchError((e: unknown) => {
    // A failed login is also a 401: only an expired live session should sign the person out.
    if (e instanceof HttpErrorResponse && e.status === 401 && !req.url.endsWith('/auth/login') && session.signedIn()) session.expired();
    return throwError(() => e);
  }));
};

/** What the server's error envelope says, or a plain fallback; the UI shows this text and never the raw response. */
export const apiMessage = (e: unknown, fallback = 'Something went wrong.'): string =>
  e instanceof HttpErrorResponse && typeof e.error?.error?.message === 'string' ? e.error.error.message : fallback;
