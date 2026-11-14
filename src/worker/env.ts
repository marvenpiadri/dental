/** Minimal R2 surface the Worker uses (the real binding is a superset); keeps Cloudflare's types out of the Angular program. */
export interface R2Like {
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string }; sha256?: string }): Promise<unknown>;
  get(key: string): Promise<{ body: ReadableStream; size: number } | null>;
  delete(key: string): Promise<void>;
}
/** Bindings and secrets from wrangler.jsonc / `wrangler secret put`. Never read process.env. */
export interface Env {
  TIDB_DATABASE_URL: string;
  FILES: R2Like;
  /** 'production' turns on Secure cookies and the __Host- prefix whatever the URL says. */
  ENVIRONMENT?: string;
  /** Absolute public origin, e.g. https://dontalist.com. Used for the Origin check and the sitemap. */
  APP_ORIGIN?: string;
  /** Server-side secret mixed into password hashes (HMAC). Rotating it invalidates every password: see docs. */
  PASSWORD_PEPPER: string;
  GOOGLE_MAPS_SERVER_KEY?: string;
  /** '1' sends signed-out visitors of app pages to /login. Off until the screens read their data from the API instead of this browser. */
  REQUIRE_LOGIN?: string;
  ASSETS?: { fetch(request: Request): Promise<Response> };
}
/** Passed to Angular SSR as requestContext. Only the verified, non-secret identity and two loaders: never the Env, so no secret can reach a rendered page. */
export interface SsrContext { session: SessionView | null; origin: string; loadClinics: () => Promise<import('../app/denteus/rules/public-record').PublicClinic[]> }
export interface SessionView { staffId: string; clinicId: string; name: string; role: string; permissions: string[]; csrf: string }
