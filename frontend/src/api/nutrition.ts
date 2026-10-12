import { apiDelete, apiGet, apiPatch, apiPost } from "./client";
import { fetchAllContent } from "./pagination";
import type { NutritionFoodCreateRequest, NutritionFoodResponse, NutritionFoodUpdateRequest, Page } from "./types";

const FOODS = "/api/nutrition/foods";

export const nutritionApi = {
  list: (page = 0, size = 20) => apiGet<Page<NutritionFoodResponse>>(FOODS, { page, size }),
  all: () => fetchAllContent((page, size) => nutritionApi.list(page, size)),
  get: (id: number) => apiGet<NutritionFoodResponse>(`${FOODS}/${id}`),
  create: (body: NutritionFoodCreateRequest) => apiPost<NutritionFoodResponse>(FOODS, body),
  update: (id: number, body: NutritionFoodUpdateRequest) => apiPatch<NutritionFoodResponse>(`${FOODS}/${id}`, body),
  remove: (id: number) => apiDelete<void>(`${FOODS}/${id}`),
};
