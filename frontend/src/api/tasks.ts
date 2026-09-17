import { apiDelete, apiGet, apiPatch, apiPost } from "./client";
import type {
  Page,
  SubtaskResponse,
  TaskCreateRequest,
  TaskPriority,
  TaskResponse,
  TaskStatus,
  TaskUpdateRequest,
} from "./types";

export interface TaskListQuery {
  status?: TaskStatus;
  projectId?: number;
  priority?: TaskPriority;
  page?: number;
  size?: number;
  [key: string]: string | number | boolean | undefined;
}

export const tasksApi = {
  list: (query: TaskListQuery = {}) => apiGet<Page<TaskResponse>>("/api/tasks", query),
  listByProject: (projectId: number, page = 0, size = 50) =>
    apiGet<Page<TaskResponse>>(`/api/projects/${projectId}/tasks`, { page, size }),
  get: (id: number) => apiGet<TaskResponse>(`/api/tasks/${id}`),
  create: (body: TaskCreateRequest) => apiPost<TaskResponse>("/api/tasks", body),
  update: (id: number, body: TaskUpdateRequest) =>
    apiPatch<TaskResponse>(`/api/tasks/${id}`, body),
  start: (id: number) => apiPost<TaskResponse>(`/api/tasks/${id}/start`),
  complete: (id: number) => apiPost<TaskResponse>(`/api/tasks/${id}/complete`),
  reopen: (id: number) => apiPost<TaskResponse>(`/api/tasks/${id}/reopen`),
  cancel: (id: number) => apiPost<TaskResponse>(`/api/tasks/${id}/cancel`),
  remove: (id: number) => apiDelete<void>(`/api/tasks/${id}`),
  addSubtask: (taskId: number, title: string) =>
    apiPost<SubtaskResponse>(`/api/tasks/${taskId}/subtasks`, { title }),
  completeSubtask: (taskId: number, subtaskId: number) =>
    apiPost<SubtaskResponse>(`/api/tasks/${taskId}/subtasks/${subtaskId}/complete`),
  reopenSubtask: (taskId: number, subtaskId: number) =>
    apiPost<SubtaskResponse>(`/api/tasks/${taskId}/subtasks/${subtaskId}/reopen`),
  removeSubtask: (taskId: number, subtaskId: number) =>
    apiDelete<void>(`/api/tasks/${taskId}/subtasks/${subtaskId}`),
};
