import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { createApp } from "../../src/app";
import { ApiError } from "../../src/errors";
import { mapDatabaseError, type Rpc } from "../../src/db";
import type { AuthUser } from "../../src/auth";
import type { Env } from "../../src/env";
import { asUser, createAuthUser, createTestDatabase } from "./database";

const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/** Executes the same SQL functions PostgREST would, inside PGlite, under the caller's JWT claims. */
export class PgliteRpc implements Rpc {
  constructor(
    private readonly db: PGlite,
    private readonly userId: string,
    private readonly now: () => string | null,
  ) {}

  async call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const names = Object.keys(args);
    if (!SAFE_IDENTIFIER.test(fn) || !names.every((n) => SAFE_IDENTIFIER.test(n))) {
      throw new Error(`unsafe identifier in rpc ${fn}`);
    }
    const sql = `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")}) as result`;
    try {
      return await asUser(
        this.db,
        this.userId,
        async (tx) => {
          const res = await tx.query<{ result: T }>(sql, names.map((n) => args[n]));
          return res.rows[0]!.result;
        },
        { now: this.now() },
      );
    } catch (err) {
      if (err instanceof ApiError) throw err;
      const e = err as { code?: string; message?: string; detail?: string };
      throw mapDatabaseError({ code: e.code, message: e.message, details: e.detail ?? null });
    }
  }
}

export const TEST_ENV: Env = {
  SUPABASE_URL: "https://project-ref.supabase.co",
  SUPABASE_ANON_KEY: "test-anon-key",
  APP_TIME_ZONE: "UTC",
  CORS_ALLOWED_ORIGINS: "",
  ALLOWED_USER_IDS: "",
};

export interface TestResponse<T = any> {
  status: number;
  body: T;
  headers: Headers;
}

export interface TestClient {
  userId: string;
  token: string;
  get<T = any>(path: string): Promise<TestResponse<T>>;
  post<T = any>(path: string, body?: unknown): Promise<TestResponse<T>>;
  patch<T = any>(path: string, body?: unknown): Promise<TestResponse<T>>;
  delete<T = any>(path: string): Promise<TestResponse<T>>;
}

export interface Harness {
  db: PGlite;
  env: Env;
  setNow(iso: string | null): void;
  request(path: string, init?: RequestInit): Promise<TestResponse>;
  newUser(email?: string): Promise<TestClient>;
}

/** Token format understood by the fake verifier: `test-user:<uuid>:<email>`. */
function fakeVerifier(token: string): Promise<AuthUser> {
  const [prefix, id, email] = token.split(":");
  if (prefix !== "test-user" || !id) {
    return Promise.reject(new ApiError(401, "UNAUTHENTICATED", "Authentication required."));
  }
  return Promise.resolve({ id, email: email ?? null, token });
}

export async function createHarness(envOverrides: Partial<Env> = {}): Promise<Harness> {
  const db = await createTestDatabase();
  let now: string | null = null;
  const env: Env = { ...TEST_ENV, ...envOverrides };
  const app = createApp({
    rpc: (_env, user) => new PgliteRpc(db, user.id, () => now),
    verifyToken: (token) => fakeVerifier(token),
  });

  async function request(path: string, init: RequestInit = {}): Promise<TestResponse> {
    const res = await app.request(`http://localhost${path}`, init, env);
    const text = await res.text();
    let body: unknown = undefined;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { status: res.status, body, headers: res.headers };
  }

  async function newUser(email = `${randomUUID()}@example.test`): Promise<TestClient> {
    const userId = randomUUID();
    await createAuthUser(db, userId, email);
    const token = `test-user:${userId}:${email}`;
    const send = (method: string, path: string, body?: unknown) =>
      request(path, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      });
    return {
      userId,
      token,
      get: (path) => send("GET", path),
      post: (path, body) => send("POST", path, body),
      patch: (path, body) => send("PATCH", path, body),
      delete: (path) => send("DELETE", path),
    };
  }

  return { db, env, setNow: (iso) => (now = iso), request, newUser };
}
