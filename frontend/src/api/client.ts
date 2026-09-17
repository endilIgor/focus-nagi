import type { ApiError } from "./types";

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, body: ApiError | null) {
    super(body?.message ?? `Request failed with status ${status}`);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = body?.code ?? "UNKNOWN";
  }
}

/** Set by AuthProvider so any 401 anywhere in the app drops the user back to /login. */
let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)"),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

let csrfTokenPromise: Promise<string> | null = null;

/** Spring's CookieCsrfTokenRepository.withHttpOnlyFalse() default: cookie XSRF-TOKEN, header X-XSRF-TOKEN. */
async function ensureCsrfToken(): Promise<string> {
  const existing = readCookie("XSRF-TOKEN");
  if (existing) return existing;
  if (!csrfTokenPromise) {
    csrfTokenPromise = fetch("/api/auth/csrf", { credentials: "include" })
      .then((res) => res.json())
      .then((body: { token: string }) => body.token)
      .finally(() => {
        csrfTokenPromise = null;
      });
  }
  return csrfTokenPromise;
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
}

function buildQuery(query?: RequestOptions["query"]): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Low-level request helper shared by every domain API module. Handles CSRF, credentials,
 * JSON (de)serialization, and mapping non-2xx responses to ApiRequestError. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {};
  let body: string | undefined;

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  if (MUTATING_METHODS.has(method)) {
    headers["X-XSRF-TOKEN"] = await ensureCsrfToken();
  }

  const response = await fetch(path + buildQuery(options.query), {
    method,
    headers,
    body,
    credentials: "include",
  });

  if (response.status === 401) {
    unauthorizedHandler?.();
  }

  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    throw new ApiRequestError(response.status, data as ApiError | null);
  }

  return data as T;
}

export function apiGet<T>(path: string, query?: RequestOptions["query"]): Promise<T> {
  return apiRequest<T>(path, { method: "GET", query });
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, { method: "POST", body });
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, { method: "PATCH", body });
}

export function apiDelete<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: "DELETE" });
}
