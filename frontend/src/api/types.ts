// Mirrors the Worker API responses (worker/src/routes + supabase/migrations) exactly
// (field names, nullability). Do not add fields here that the API does not actually return.

export type TaskStatus = "TODO" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH";
export type ProjectStatus = "ACTIVE" | "COMPLETED" | "ARCHIVED";
export type GoalType = "FOCUS_MINUTES" | "FOCUS_SESSIONS" | "TASKS_COMPLETED";
export type GoalPeriod = "DAILY" | "WEEKLY" | "MONTHLY" | "CUSTOM";
export type GoalStatus = "ACTIVE" | "COMPLETED" | "ARCHIVED";
export type FocusSessionStatus = "RUNNING" | "PAUSED" | "COMPLETED" | "CANCELLED";
export type AnalyticsPeriod = "TODAY" | "WEEK" | "MONTH";

export interface ApiError {
  code: string;
  message: string;
  timestamp: string;
}

export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
  numberOfElements: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

/** Identity behind the verified Supabase access token (GET /api/auth/me). */
export interface OwnerResponse {
  id: string;
  email: string | null;
  /** Whether the database enables the personal health module for this account. */
  healthAccess: boolean;
}

export interface SubtaskResponse {
  id: number;
  title: string;
  completed: boolean;
  createdAt: string;
}

export interface TaskResponse {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  estimatedMinutes: number | null;
  dueDate: string | null;
  projectId: number | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  subtasks: SubtaskResponse[] | null;
}

export interface TaskCreateRequest {
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  estimatedMinutes?: number | null;
  dueDate?: string | null;
  projectId?: number | null;
}

export interface TaskUpdateRequest {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  estimatedMinutes?: number | null;
  dueDate?: string | null;
  projectId?: number | null;
}

export interface ProjectResponse {
  id: number;
  title: string;
  description: string | null;
  status: ProjectStatus;
  startDate: string | null;
  dueDate: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectCreateRequest {
  title: string;
  description?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
}

export interface ProjectUpdateRequest {
  title?: string;
  description?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
}

export interface ProjectFocusResponse {
  projectId: number;
  totalFocusSeconds: number;
}

export interface FocusSessionResponse {
  id: number;
  taskId: number | null;
  projectId: number | null;
  startedAt: string;
  endedAt: string | null;
  plannedFocusMinutes: number;
  plannedBreakMinutes: number | null;
  pausedSecondsAccum: number;
  lastPausedAt: string | null;
  actualFocusSeconds: number | null;
  status: FocusSessionStatus;
  notes: string | null;
  createdAt: string;
}

export interface FocusSessionStartRequest {
  plannedFocusMinutes: number;
  plannedBreakMinutes?: number | null;
  taskId?: number | null;
  projectId?: number | null;
  notes?: string | null;
}

export interface GoalResponse {
  id: number;
  title: string;
  description: string | null;
  type: GoalType;
  targetValue: number;
  period: GoalPeriod;
  startDate: string;
  endDate: string | null;
  status: GoalStatus;
  projectId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface GoalCreateRequest {
  title: string;
  description?: string | null;
  type: GoalType;
  targetValue: number;
  period: GoalPeriod;
  startDate: string;
  endDate?: string | null;
  projectId?: number | null;
}

export interface GoalUpdateRequest {
  title?: string;
  description?: string | null;
  targetValue?: number;
  startDate?: string;
  endDate?: string | null;
}

export interface GoalProgressResponse {
  goalId: number;
  type: GoalType;
  currentValue: number;
  targetValue: number;
  done: boolean;
  periodStart: string;
  periodEnd: string;
}

export interface ChecklistItemResponse {
  id: number;
  title: string;
  date: string;
  completed: boolean;
  createdAt: string;
}

export interface ChecklistItemCreateRequest {
  title: string;
  date: string;
}

export interface ChecklistItemUpdateRequest {
  completed: boolean;
}

export interface JournalEntryResponse {
  id: number;
  entryDate: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface JournalEntryCreateRequest {
  entryDate: string;
  content: string;
}

export interface JournalEntryUpdateRequest {
  entryDate?: string;
  content?: string;
}

export interface NoteResponse {
  id: number;
  title: string;
  content: string | null;
  pinned: boolean;
  projectId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface NoteCreateRequest {
  title: string;
  content?: string | null;
  projectId?: number | null;
}

export interface NoteUpdateRequest {
  title?: string;
  content?: string | null;
  projectId?: number | null;
}

export interface TodayTaskResponse {
  id: number;
  title: string;
  dueDate: string | null;
  priority: TaskPriority;
  projectId: number | null;
}

export interface TodayProjectResponse {
  id: number;
  title: string;
}

export interface TodayGoalResponse {
  id: number;
  title: string;
  type: GoalType;
  currentValue: number;
  targetValue: number;
  done: boolean;
}

export interface TodayResponse {
  date: string;
  currentSession: FocusSessionResponse | null;
  focusedMinutesToday: number;
  sessionsToday: number;
  tasksCompletedToday: number;
  tasksDueToday: TodayTaskResponse[];
  overdueTasks: TodayTaskResponse[];
  activeProjects: TodayProjectResponse[];
  goals: TodayGoalResponse[];
}

export interface FocusSummaryResponse {
  period: AnalyticsPeriod;
  dateStart: string;
  dateEnd: string;
  focusedMinutes: number;
  sessionCount: number;
  tasksCompleted: number;
}

export interface StreaksResponse {
  currentStreak: number;
  longestStreak: number;
}

export interface DayFocusResponse {
  date: string;
  focusedMinutes: number;
}

export interface WeekFocusResponse {
  weekStart: string;
  focusedMinutes: number;
}

export interface MonthFocusResponse {
  month: string;
  focusedMinutes: number;
}

export interface HourFocusResponse {
  hour: number;
  focusedMinutes: number;
}

export interface ProjectFocusBreakdownResponse {
  projectId: number | null;
  title: string | null;
  focusedMinutes: number;
}

/** ISO weekday: 1 = Monday .. 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type TrainingExerciseMode = "REPETITIONS" | "DURATION";
export type NutritionMeal = "BREAKFAST" | "LUNCH" | "AFTERNOON_SNACK" | "DINNER";

export interface TrainingRoutineResponse {
  id: number;
  name: string;
  /** Sorted and unique; an empty array means no days. */
  weekdays: IsoWeekday[];
  exerciseCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingRoutineCreateRequest {
  name: string;
  weekdays?: IsoWeekday[] | null;
}

/** Omitted keys keep the stored value; null weekdays clears them. */
export interface TrainingRoutineUpdateRequest {
  name?: string;
  weekdays?: IsoWeekday[] | null;
}

/** The database guarantees exactly the target of the exercise mode is set. */
export type TrainingExerciseResponse = {
  id: number;
  routineId: number;
  name: string;
  sets: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
} & (
  | { mode: "REPETITIONS"; repetitions: number; durationSeconds: null }
  | { mode: "DURATION"; repetitions: null; durationSeconds: number }
);

export type TrainingExerciseCreateRequest = {
  name: string;
  sets: number;
  notes?: string | null;
} & (
  | { mode: "REPETITIONS"; repetitions: number; durationSeconds?: null }
  | { mode: "DURATION"; durationSeconds: number; repetitions?: null }
);

/** Mode/target coherence depends on the stored exercise and is enforced by the API. */
export interface TrainingExerciseUpdateRequest {
  name?: string;
  sets?: number;
  mode?: TrainingExerciseMode;
  repetitions?: number | null;
  durationSeconds?: number | null;
  notes?: string | null;
}

export interface NutritionFoodResponse {
  id: number;
  meal: NutritionMeal;
  name: string;
  quantity: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NutritionFoodCreateRequest {
  meal: NutritionMeal;
  name: string;
  quantity?: string | null;
}

/** Omitted keys keep the stored value; null quantity clears it. */
export interface NutritionFoodUpdateRequest {
  meal?: NutritionMeal;
  name?: string;
  quantity?: string | null;
}
