import { ApiRequestError, apiGet } from "./client";
import { getSupabase } from "./supabase";
import type { OwnerResponse } from "./types";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

interface AuthErrorLike {
  status?: number;
  code?: string;
  message?: string;
}

/** Maps Supabase Auth failures onto the API error codes the UI already understands. */
function toApiError(error: AuthErrorLike): ApiRequestError {
  const timestamp = new Date().toISOString();
  if (error.status === 429 || error.code === "over_request_rate_limit") {
    return new ApiRequestError(429, {
      code: "LOGIN_LOCKED",
      message: "Too many failed attempts. Try again later.",
      timestamp,
    });
  }
  if (error.status === 400 || error.status === 401 || error.code === "invalid_credentials") {
    return new ApiRequestError(401, {
      code: "INVALID_CREDENTIALS",
      message: "Invalid email or password.",
      timestamp,
    });
  }
  return new ApiRequestError(error.status ?? 500, {
    code: "AUTH_ERROR",
    message: error.message ?? "Authentication failed.",
    timestamp,
  });
}

export const authApi = {
  /** Signs in with Supabase Auth, then confirms the session with the API (owner allowlist). */
  login: async ({ email, password }: LoginRequest): Promise<OwnerResponse> => {
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    if (error) throw toApiError(error);
    return authApi.me();
  },
  /** Revokes this browser's refresh token; other devices stay signed in. */
  logout: async (): Promise<void> => {
    await getSupabase().auth.signOut({ scope: "local" });
  },
  me: () => apiGet<OwnerResponse>("/api/auth/me"),
  /** Re-verifies the current password before setting a new one. */
  changePassword: async ({ currentPassword, newPassword }: ChangePasswordRequest): Promise<void> => {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    const email = data.session?.user.email;
    if (!email) {
      throw new ApiRequestError(401, {
        code: "UNAUTHENTICATED",
        message: "Authentication required.",
        timestamp: new Date().toISOString(),
      });
    }
    const reauth = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (reauth.error) throw toApiError(reauth.error);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw toApiError(error);
  },
};
