import { describe, expect, it } from "vitest";
import { assertPublicSupabaseKey } from "./supabase";

const b64 = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, "");
const jwt = (payload: object) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.signature`;

describe("assertPublicSupabaseKey", () => {
  it("accepts anon and publishable keys", () => {
    expect(() => assertPublicSupabaseKey(jwt({ role: "anon", iss: "supabase" }))).not.toThrow();
    expect(() => assertPublicSupabaseKey("sb_publishable_abc123")).not.toThrow();
  });

  it("refuses privileged keys so they can never ship in the bundle", () => {
    expect(() => assertPublicSupabaseKey(jwt({ role: "service_role", iss: "supabase" }))).toThrow(/service/i);
    expect(() => assertPublicSupabaseKey("sb_secret_abc123")).toThrow(/secret/i);
  });

  it("refuses a missing key", () => {
    expect(() => assertPublicSupabaseKey("")).toThrow();
  });
});
