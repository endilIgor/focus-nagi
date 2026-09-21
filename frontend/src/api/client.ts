import { getAccessToken, refreshAccessToken } from "./supabase";
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

/** Optional absolute API origin for cross-origin deployments; empty keeps same-origin /api URLs. */
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

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

function parseBody(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Low-level request helper shared by every domain API module. Attaches the Supabase access token
 * as a Bearer credential, retries once with a refreshed token after a 401, and maps non-2xx
 * responses to ApiRequestError. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const url = API_BASE_URL + path + buildQuery(options.query);
  const body = options.body !== undefined ? JSON.stringify(options.body) : undefined;

  const send = (token: string | null) => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(url, { method, headers, body, credentials: "omit" });
  };

  const token = await getAccessToken();
  let response = await send(token);

  if (response.status === 401 && token) {
    const refreshed = await refreshAccessToken();
    if (refreshed) response = await send(refreshed);
  }

  if (response.status === 401) {
    unauthorizedHandler?.();
  }

  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  const data = parseBody(await response.text());

  if (!response.ok) {
    const envelope = data && typeof data === "object" && "code" in data ? (data as ApiError) : null;
    throw new ApiRequestError(response.status, envelope);
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
