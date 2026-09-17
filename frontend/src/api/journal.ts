import { apiDelete, apiGet, apiPatch, apiPost } from "./client";
import type {
  JournalEntryCreateRequest,
  JournalEntryResponse,
  JournalEntryUpdateRequest,
  Page,
} from "./types";

export const journalApi = {
  byDate: (date: string) => apiGet<JournalEntryResponse[]>("/api/journal", { date }),
  range: (from: string, to: string, page = 0, size = 20) =>
    apiGet<Page<JournalEntryResponse>>("/api/journal/range", { from, to, page, size }),
  recent: (page = 0, size = 20) =>
    apiGet<Page<JournalEntryResponse>>("/api/journal/recent", { page, size }),
  create: (body: JournalEntryCreateRequest) =>
    apiPost<JournalEntryResponse>("/api/journal", body),
  update: (id: number, body: JournalEntryUpdateRequest) =>
    apiPatch<JournalEntryResponse>(`/api/journal/${id}`, body),
  remove: (id: number) => apiDelete<void>(`/api/journal/${id}`),
};
