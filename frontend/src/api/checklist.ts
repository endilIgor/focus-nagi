import { apiDelete, apiGet, apiPatch, apiPost } from "./client";
import type { ChecklistItemCreateRequest, ChecklistItemResponse, ChecklistItemUpdateRequest } from "./types";

export const checklistApi = {
  byDate: (date: string) => apiGet<ChecklistItemResponse[]>("/api/checklist", { date }),
  create: (body: ChecklistItemCreateRequest) => apiPost<ChecklistItemResponse>("/api/checklist", body),
  update: (id: number, body: ChecklistItemUpdateRequest) => apiPatch<ChecklistItemResponse>(`/api/checklist/${id}`, body),
  remove: (id: number) => apiDelete<void>(`/api/checklist/${id}`),
};
