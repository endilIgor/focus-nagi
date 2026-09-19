import { apiGet, apiPost, refreshCsrfToken } from "./client";
import type { OwnerResponse } from "./types";

export interface LoginRequest {
  username: string;
  password: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/** The auth change already happened server-side, so a failed re-sync must not fail the
 * auth call itself; the next mutation retries the sync with an empty cache. */
async function refreshCsrfQuietly(): Promise<void> {
  await refreshCsrfToken().catch(() => undefined);
}

export const authApi = {
  login: async (body: LoginRequest) => {
    const me = await apiPost<OwnerResponse>("/api/auth/login", body);
    await refreshCsrfQuietly();
    return me;
  },
  logout: async () => {
    await apiPost<void>("/api/auth/logout");
    await refreshCsrfQuietly();
  },
  me: () => apiGet<OwnerResponse>("/api/auth/me"),
  changePassword: async (body: ChangePasswordRequest) => {
    await apiPost<void>("/api/auth/password", body);
    await refreshCsrfQuietly();
  },
};
