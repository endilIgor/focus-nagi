/** Enumerations shared by the HTTP layer and the SQL API (must match the CHECK constraints). */
export const PROJECT_STATUSES = ["ACTIVE", "COMPLETED", "ARCHIVED"] as const;
export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export const GOAL_TYPES = ["FOCUS_MINUTES", "FOCUS_SESSIONS", "TASKS_COMPLETED"] as const;
export const GOAL_PERIODS = ["DAILY", "WEEKLY", "MONTHLY", "CUSTOM"] as const;
export const GOAL_STATUSES = ["ACTIVE", "COMPLETED", "ARCHIVED"] as const;
export const FOCUS_SESSION_STATUSES = ["RUNNING", "PAUSED", "COMPLETED", "CANCELLED"] as const;
export const ANALYTICS_PERIODS = ["TODAY", "WEEK", "MONTH"] as const;
