import { apiGet, apiPost } from "./client";
import type { OwnerResponse } from "./types";

export interface LoginRequest {
  username: string;
  password: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export const authApi = {
  login: (body: LoginRequest) => apiPost<OwnerResponse>("/api/auth/login", body),
  logout: () => apiPost<void>("/api/auth/logout"),
  me: () => apiGet<OwnerResponse>("/api/auth/me"),
  changePassword: (body: ChangePasswordRequest) =>
    apiPost<void>("/api/auth/password", body),
};
