import { apiDelete, apiGet, apiPatch, apiPost } from "./client";
import { fetchAllContent } from "./pagination";
import type {
  Page,
  TrainingExerciseCreateRequest,
  TrainingExerciseResponse,
  TrainingExerciseUpdateRequest,
  TrainingRoutineCreateRequest,
  TrainingRoutineResponse,
  TrainingRoutineUpdateRequest,
} from "./types";

const ROUTINES = "/api/training/routines";
const exercisesOf = (routineId: number) => `${ROUTINES}/${routineId}/exercises`;

export const trainingApi = {
  listRoutines: (page = 0, size = 20) => apiGet<Page<TrainingRoutineResponse>>(ROUTINES, { page, size }),
  allRoutines: () => fetchAllContent((page, size) => trainingApi.listRoutines(page, size)),
  getRoutine: (id: number) => apiGet<TrainingRoutineResponse>(`${ROUTINES}/${id}`),
  createRoutine: (body: TrainingRoutineCreateRequest) => apiPost<TrainingRoutineResponse>(ROUTINES, body),
  updateRoutine: (id: number, body: TrainingRoutineUpdateRequest) =>
    apiPatch<TrainingRoutineResponse>(`${ROUTINES}/${id}`, body),
  removeRoutine: (id: number) => apiDelete<void>(`${ROUTINES}/${id}`),

  listExercises: (routineId: number, page = 0, size = 20) =>
    apiGet<Page<TrainingExerciseResponse>>(exercisesOf(routineId), { page, size }),
  allExercises: (routineId: number) =>
    fetchAllContent((page, size) => trainingApi.listExercises(routineId, page, size)),
  getExercise: (routineId: number, exerciseId: number) =>
    apiGet<TrainingExerciseResponse>(`${exercisesOf(routineId)}/${exerciseId}`),
  createExercise: (routineId: number, body: TrainingExerciseCreateRequest) =>
    apiPost<TrainingExerciseResponse>(exercisesOf(routineId), body),
  updateExercise: (routineId: number, exerciseId: number, body: TrainingExerciseUpdateRequest) =>
    apiPatch<TrainingExerciseResponse>(`${exercisesOf(routineId)}/${exerciseId}`, body),
  removeExercise: (routineId: number, exerciseId: number) =>
    apiDelete<void>(`${exercisesOf(routineId)}/${exerciseId}`),
};
