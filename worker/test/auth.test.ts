import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { bearerToken, createSupabaseVerifier } from "../src/auth";
import type { Env } from "../src/env";

const ENV: Env = { SUPABASE_URL: "https://ref.supabase.co", SUPABASE_ANON_KEY: "anon" };
const ISSUER = "https://ref.supabase.co/auth/v1";
const USER_ID = "3f9a1c7e-2b4d-4e8f-9a6b-1c2d3e4f5a6b";

let privateKey: CryptoKey;
let jwks: { keys: object[] };

beforeAll(async () => {
  const pair = await generateKeyPair("ES256", { extractable: true });
  privateKey = pair.privateKey;
  jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "ES256", use: "sig" }] };
});

function sign(claims: Record<string, unknown> = {}, options: { issuer?: string; audience?: string; exp?: string } = {}) {
  return new SignJWT({ role: "authenticated", email: "owner@example.test", ...claims })
    .setProtectedHeader({ alg: "ES256", kid: "k1" })
    .setSubject(USER_ID)
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? "authenticated")
    .setIssuedAt()
    .setExpirationTime(options.exp ?? "1h")
    .sign(privateKey);
}

function jwksFetcher() {
  return vi.fn(async (url: string) => {
    expect(url).toBe("https://ref.supabase.co/auth/v1/.well-known/jwks.json");
    return new Response(JSON.stringify(jwks), { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

describe("bearerToken", () => {
  it("extracts bearer credentials only", () => {
    expect(bearerToken("Bearer abc.def")).toBe("abc.def");
    expect(bearerToken("bearer abc")).toBe("abc");
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken("Bearer")).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
  });
});

describe("Supabase JWT verification", () => {
  it("accepts a valid asymmetric token via the project JWKS and caches the key set", async () => {
    const fetcher = jwksFetcher();
    const verify = createSupabaseVerifier(fetcher);
    const token = await sign();
    await expect(verify(token, ENV)).resolves.toEqual({ id: USER_ID, email: "owner@example.test", token });
    await verify(await sign(), ENV);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an expired token", () => sign({}, { exp: "-1m" })],
    ["a foreign issuer", () => sign({}, { issuer: "https://other.supabase.co/auth/v1" })],
    ["a wrong audience", () => sign({}, { audience: "anon" })],
    ["the anon role", () => sign({ role: "anon" })],
    ["a service_role token", () => sign({ role: "service_role" })],
  ])("rejects %s", async (_label, make) => {
    const verify = createSupabaseVerifier(jwksFetcher());
    await expect(verify(await make(), ENV)).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
  });

  it("rejects tokens signed by an unknown key", async () => {
    const other = await generateKeyPair("ES256");
    const forged = await new SignJWT({ role: "authenticated" })
      .setProtectedHeader({ alg: "ES256", kid: "k1" })
      .setSubject(USER_ID)
      .setIssuer(ISSUER)
      .setAudience("authenticated")
      .setExpirationTime("1h")
      .sign(other.privateKey);
    await expect(createSupabaseVerifier(jwksFetcher())(forged, ENV)).rejects.toMatchObject({ status: 401 });
  });

  it("rejects garbage", async () => {
    await expect(createSupabaseVerifier(jwksFetcher())("not.a.jwt", ENV)).rejects.toMatchObject({ status: 401 });
  });

  it("supports the legacy HS256 secret only when configured", async () => {
    const secret = "legacy-shared-secret-with-enough-entropy-000000";
    const token = await new SignJWT({ role: "authenticated" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(USER_ID)
      .setIssuer(ISSUER)
      .setAudience("authenticated")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(secret));
    const verify = createSupabaseVerifier(jwksFetcher());
    await expect(verify(token, ENV)).rejects.toMatchObject({ status: 401 });
    await expect(verify(token, { ...ENV, SUPABASE_JWT_SECRET: secret })).resolves.toMatchObject({ id: USER_ID, email: null });
    await expect(verify(token, { ...ENV, SUPABASE_JWT_SECRET: "wrong-secret" })).rejects.toMatchObject({ status: 401 });
  });
});
