/** Bindings configured in wrangler.toml ([vars]) or as Worker secrets. */
export interface Env {
  /** Supabase project URL, e.g. https://<ref>.supabase.co. */
  SUPABASE_URL: string;
  /** Supabase anon/publishable key. Public by design; RLS protects the data. */
  SUPABASE_ANON_KEY: string;
  /** Optional legacy HS256 JWT secret. Only needed when the project has no asymmetric signing keys. */
  SUPABASE_JWT_SECRET?: string;
  /** Comma-separated auth user ids allowed to call the API. Empty = any valid Supabase user. */
  ALLOWED_USER_IDS?: string;
  /** IANA time zone for day/week/month boundaries. Defaults to UTC. */
  APP_TIME_ZONE?: string;
  /** Comma-separated exact origins allowed for cross-origin calls. Empty = same-origin only. */
  CORS_ALLOWED_ORIGINS?: string;
}

export function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

const validZones = new Map<string, boolean>();

export function isValidTimeZone(zone: string): boolean {
  let valid = validZones.get(zone);
  if (valid === undefined) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: zone });
      valid = true;
    } catch {
      valid = false;
    }
    validZones.set(zone, valid);
  }
  return valid;
}

export function supabaseBaseUrl(env: Env): string {
  return env.SUPABASE_URL.replace(/\/+$/, "");
}
