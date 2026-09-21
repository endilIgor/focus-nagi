import type { Context } from "hono";
import type { AuthUser } from "./auth";
import type { Rpc } from "./db";
import type { Env } from "./env";

export interface AppEnv {
  Bindings: Env;
  Variables: {
    user: AuthUser;
    rpc: Rpc;
    /** Validated IANA time zone for calendar boundaries. */
    timeZone: string;
  };
}

export type AppContext = Context<AppEnv>;

/** Invokes one SQL API function as the authenticated caller. */
export function callRpc<T>(c: AppContext, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  return c.var.rpc.call<T>(fn, args);
}
