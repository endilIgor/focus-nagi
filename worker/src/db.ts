import { ApiError, DOMAIN_ERRORS, internalError, unauthenticated, accessDenied, validationError } from "./errors";
import { supabaseBaseUrl, type Env } from "./env";

/** Calls one transactional SQL API function on behalf of the authenticated user. */
export interface Rpc {
  call<T>(fn: string, args: Record<string, unknown>): Promise<T>;
}

/** Shape shared by PostgREST error bodies and PostgreSQL driver errors. */
export interface DatabaseErrorInfo {
  code?: string | undefined;
  message?: string | undefined;
  details?: string | null | undefined;
}

const INVALID_INPUT_CODES = new Set([
  "22001", // string_data_right_truncation
  "22003", // numeric_value_out_of_range
  "22007", // invalid_datetime_format
  "22008", // datetime_field_overflow
  "22P02", // invalid_text_representation
  "23502", // not_null_violation
  "23514", // check_violation
]);

/** Translates a database/PostgREST failure into the public API error contract without leaking internals. */
export function mapDatabaseError(err: DatabaseErrorInfo): ApiError {
  const code = err.code ?? "";
  if (code === "P0001" && err.message && err.message in DOMAIN_ERRORS) {
    const [status, fallback] = DOMAIN_ERRORS[err.message]!;
    return new ApiError(status, err.message, err.details || fallback);
  }
  if (code === "23505") {
    return new ApiError(409, "CONFLICT", "The request conflicts with the current state.");
  }
  if (code === "23503") {
    return validationError("Referenced resource does not exist.");
  }
  if (INVALID_INPUT_CODES.has(code)) {
    return validationError("Invalid request data.");
  }
  if (code === "40001" || code === "40P01") {
    return new ApiError(409, "CONCURRENT_MODIFICATION", "The resource was modified concurrently. Reload and try again.");
  }
  if (code === "PGRST301" || code === "PGRST302" || code === "PGRST303") {
    return unauthenticated();
  }
  if (code === "42501") {
    return accessDenied();
  }
  return internalError();
}

const FUNCTION_NAME = /^api_[a-z_]+$/;
const RPC_TIMEOUT_MS = 10_000;

/** Production RPC transport: PostgREST with the anon key plus the caller's own JWT, so RLS applies. */
export class PostgrestRpc implements Rpc {
  constructor(
    private readonly env: Env,
    private readonly accessToken: string,
    private readonly fetcher: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  async call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    if (!FUNCTION_NAME.test(fn)) {
      throw new Error(`Refusing to call unexpected function name: ${fn}`);
    }
    let response: Response;
    try {
      response = await this.fetcher(`${supabaseBaseUrl(this.env)}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: {
          apikey: this.env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      });
    } catch (err) {
      console.error(`rpc ${fn} transport failure`, err instanceof Error ? err.name : "unknown");
      throw new ApiError(502, "UPSTREAM_UNAVAILABLE", "Database service unavailable.");
    }

    const text = await response.text();
    if (!response.ok) {
      let info: DatabaseErrorInfo = {};
      try {
        info = JSON.parse(text) as DatabaseErrorInfo;
      } catch {
        // Non-JSON gateway error: fall through to the status-based mapping below.
      }
      if (!info.code && response.status === 401) throw unauthenticated();
      if (!info.code && response.status >= 500) {
        throw new ApiError(502, "UPSTREAM_UNAVAILABLE", "Database service unavailable.");
      }
      const mapped = mapDatabaseError(info);
      if (mapped.status === 500) {
        console.error(`rpc ${fn} failed`, response.status, info.code ?? "no-code");
      }
      throw mapped;
    }
    return (text ? JSON.parse(text) : null) as T;
  }
}
