import { apiGet, apiPatch, apiPost } from "./client";
import type {
  GoalCreateRequest,
  GoalProgressResponse,
  GoalResponse,
  GoalStatus,
  GoalUpdateRequest,
  Page,
} from "./types";

export const goalsApi = {
  list: (status?: GoalStatus, page = 0, size = 50) =>
    apiGet<Page<GoalResponse>>("/api/goals", { status, page, size }),
  get: (id: number) => apiGet<GoalResponse>(`/api/goals/${id}`),
  create: (body: GoalCreateRequest) => apiPost<GoalResponse>("/api/goals", body),
  update: (id: number, body: GoalUpdateRequest) =>
    apiPatch<GoalResponse>(`/api/goals/${id}`, body),
  complete: (id: number) => apiPost<GoalResponse>(`/api/goals/${id}/complete`),
  archive: (id: number) => apiPost<GoalResponse>(`/api/goals/${id}/archive`),
  restore: (id: number) => apiPost<GoalResponse>(`/api/goals/${id}/restore`),
  progress: (id: number) => apiGet<GoalProgressResponse>(`/api/goals/${id}/progress`),
};
