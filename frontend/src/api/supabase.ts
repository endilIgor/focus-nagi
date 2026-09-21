import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const segment = token.split(".")[1];
  if (!segment) return null;
  try {
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "="))) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

/**
 * The browser bundle may only ever contain the public anon/publishable key. Fail loudly if a
 * privileged key (legacy service_role JWT or new sb_secret_ key) is configured by mistake.
 */
export function assertPublicSupabaseKey(key: string): void {
  if (!key) throw new Error("VITE_SUPABASE_ANON_KEY is not configured.");
  if (key.startsWith("sb_secret_")) {
    throw new Error("Refusing to use a Supabase secret key in the browser. Use the publishable key.");
  }
  if (decodeJwtPayload(key)?.role === "service_role") {
    throw new Error("Refusing to use the Supabase service_role key in the browser. Use the anon key.");
  }
}

let client: SupabaseClient | null = null;

/** Lazily created Supabase client (Auth only). Sessions persist in localStorage and auto-refresh. */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
    if (!url) throw new Error("VITE_SUPABASE_URL is not configured.");
    assertPublicSupabaseKey(key);
    client = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

/** Current access token; supabase-js refreshes an expired session transparently. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}

/** Forces a refresh (used once after a 401); null when the session can no longer be refreshed. */
export async function refreshAccessToken(): Promise<string | null> {
  const { data, error } = await getSupabase().auth.refreshSession();
  if (error) return null;
  return data.session?.access_token ?? null;
}
