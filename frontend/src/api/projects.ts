import { apiGet, apiPatch, apiPost } from "./client";
import type {
  Page,
  ProjectCreateRequest,
  ProjectFocusResponse,
  ProjectResponse,
  ProjectStatus,
  ProjectUpdateRequest,
} from "./types";

export const projectsApi = {
  list: (status?: ProjectStatus, page = 0, size = 50) =>
    apiGet<Page<ProjectResponse>>("/api/projects", { status, page, size }),
  get: (id: number) => apiGet<ProjectResponse>(`/api/projects/${id}`),
  create: (body: ProjectCreateRequest) => apiPost<ProjectResponse>("/api/projects", body),
  update: (id: number, body: ProjectUpdateRequest) =>
    apiPatch<ProjectResponse>(`/api/projects/${id}`, body),
  complete: (id: number) => apiPost<ProjectResponse>(`/api/projects/${id}/complete`),
  archive: (id: number) => apiPost<ProjectResponse>(`/api/projects/${id}/archive`),
  restore: (id: number) => apiPost<ProjectResponse>(`/api/projects/${id}/restore`),
  focus: (id: number) => apiGet<ProjectFocusResponse>(`/api/projects/${id}/focus`),
};
