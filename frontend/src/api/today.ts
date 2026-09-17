import { apiGet } from "./client";
import type { TodayResponse } from "./types";

export const todayApi = {
  get: () => apiGet<TodayResponse>("/api/today"),
};
