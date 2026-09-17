import { apiDelete, apiGet, apiPatch, apiPost } from "./client";
import type { NoteCreateRequest, NoteResponse, NoteUpdateRequest, Page } from "./types";

export interface NoteListQuery {
  pinned?: boolean;
  projectId?: number;
  q?: string;
  page?: number;
  size?: number;
  [key: string]: string | number | boolean | undefined;
}

export const notesApi = {
  list: (query: NoteListQuery = {}) => apiGet<Page<NoteResponse>>("/api/notes", query),
  get: (id: number) => apiGet<NoteResponse>(`/api/notes/${id}`),
  create: (body: NoteCreateRequest) => apiPost<NoteResponse>("/api/notes", body),
  update: (id: number, body: NoteUpdateRequest) =>
    apiPatch<NoteResponse>(`/api/notes/${id}`, body),
  remove: (id: number) => apiDelete<void>(`/api/notes/${id}`),
  pin: (id: number) => apiPost<NoteResponse>(`/api/notes/${id}/pin`),
  unpin: (id: number) => apiPost<NoteResponse>(`/api/notes/${id}/unpin`),
};
