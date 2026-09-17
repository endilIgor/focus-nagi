import { apiGet, apiPost } from "./client";
import type {
  FocusSessionResponse,
  FocusSessionStartRequest,
  FocusSessionStatus,
  Page,
} from "./types";

export interface FocusSessionListQuery {
  status?: FocusSessionStatus;
  projectId?: number;
  taskId?: number;
  from?: string;
  to?: string;
  page?: number;
  size?: number;
  [key: string]: string | number | boolean | undefined;
}

export const focusSessionsApi = {
  start: (body: FocusSessionStartRequest) =>
    apiPost<FocusSessionResponse>("/api/focus-sessions", body),
  current: () => apiGet<FocusSessionResponse | undefined>("/api/focus-sessions/current"),
  list: (query: FocusSessionListQuery = {}) =>
    apiGet<Page<FocusSessionResponse>>("/api/focus-sessions", query),
  pause: (id: number) => apiPost<FocusSessionResponse>(`/api/focus-sessions/${id}/pause`),
  resume: (id: number) => apiPost<FocusSessionResponse>(`/api/focus-sessions/${id}/resume`),
  finish: (id: number) => apiPost<FocusSessionResponse>(`/api/focus-sessions/${id}/finish`),
  cancel: (id: number) => apiPost<FocusSessionResponse>(`/api/focus-sessions/${id}/cancel`),
};
