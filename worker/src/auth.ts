import {
  createRemoteJWKSet,
  customFetch,
  decodeProtectedHeader,
  jwtVerify,
  type FetchImplementation,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";
import { unauthenticated } from "./errors";
import { supabaseBaseUrl, type Env } from "./env";

export interface AuthUser {
  id: string;
  email: string | null;
  /** The caller's own access token, forwarded to PostgREST so RLS evaluates auth.uid(). */
  token: string;
}

export type TokenVerifier = (token: string, env: Env) => Promise<AuthUser>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ASYMMETRIC_ALGORITHMS = ["ES256", "RS256", "EdDSA"];

/** Extracts the bearer token, or null when the header is missing or not a Bearer credential. */
export function bearerToken(header: string | undefined | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1]! : null;
}

function toUser(payload: JWTPayload, token: string): AuthUser {
  const sub = payload.sub;
  if (typeof sub !== "string" || !UUID.test(sub) || payload["role"] !== "authenticated") {
    throw unauthenticated();
  }
  const email = typeof payload["email"] === "string" && payload["email"] ? (payload["email"] as string) : null;
  return { id: sub, email, token };
}

/**
 * Verifies Supabase Auth access tokens locally: asymmetric keys via the project's JWKS endpoint
 * (cached per isolate), or the legacy HS256 shared secret when one is configured.
 */
export function createSupabaseVerifier(fetcher?: FetchImplementation): TokenVerifier {
  const keySets = new Map<string, JWTVerifyGetKey>();

  const jwksFor = (baseUrl: string): JWTVerifyGetKey => {
    let keySet = keySets.get(baseUrl);
    if (!keySet) {
      keySet = createRemoteJWKSet(new URL(`${baseUrl}/auth/v1/.well-known/jwks.json`), {
        cooldownDuration: 30_000,
        cacheMaxAge: 10 * 60_000,
        ...(fetcher ? { [customFetch]: fetcher } : {}),
      });
      keySets.set(baseUrl, keySet);
    }
    return keySet;
  };

  return async (token, env) => {
    const baseUrl = supabaseBaseUrl(env);
    const options = { issuer: `${baseUrl}/auth/v1`, audience: "authenticated" };
    try {
      const { alg } = decodeProtectedHeader(token);
      if (alg === "HS256") {
        if (!env.SUPABASE_JWT_SECRET) throw unauthenticated();
        const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);
        const { payload } = await jwtVerify(token, secret, { ...options, algorithms: ["HS256"] });
        return toUser(payload, token);
      }
      const { payload } = await jwtVerify(token, jwksFor(baseUrl), {
        ...options,
        algorithms: ASYMMETRIC_ALGORITHMS,
      });
      return toUser(payload, token);
    } catch {
      throw unauthenticated();
    }
  };
}
