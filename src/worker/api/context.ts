import type { Db } from '../db';
import type { Env } from '../env';
import type { Session } from '../services/auth';

/** `s` is the verified session (clinic and person come only from here). Public routes get PublicCtx: no session exists yet. */
export interface Ctx { req: Request; env: Env; db: Db; url: URL; s: Session; params: string[] }
export type PublicCtx = Omit<Ctx, 's'>;
