import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Expected failure rendered as `{ code, message, timestamp }`, matching the original API contract. */
export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiErrorBody {
  code: string;
  message: string;
  timestamp: string;
}

export function errorBody(code: string, message: string): ApiErrorBody {
  return { code, message, timestamp: new Date().toISOString() };
}

/** Domain error codes raised by the SQL API functions, with their HTTP status and default message. */
export const DOMAIN_ERRORS: Readonly<Record<string, readonly [ContentfulStatusCode, string]>> = {
  UNAUTHENTICATED: [401, "Authentication required."],
  PROJECT_NOT_FOUND: [404, "Project not found."],
  TASK_NOT_FOUND: [404, "Task not found."],
  SUBTASK_NOT_FOUND: [404, "Subtask not found."],
  GOAL_NOT_FOUND: [404, "Goal not found."],
  NOTE_NOT_FOUND: [404, "Note not found."],
  JOURNAL_ENTRY_NOT_FOUND: [404, "Journal entry not found."],
  FOCUS_SESSION_NOT_FOUND: [404, "Focus session not found."],
  PROJECT_INVALID_DATES: [400, "Due date cannot be before start date."],
  GOAL_INVALID_DATES: [400, "End date cannot be before start date."],
  JOURNAL_INVALID_RANGE: [400, "Invalid date range."],
  JOURNAL_FUTURE_DATE: [400, "Entry date cannot be in the future."],
  ANALYTICS_INVALID_RANGE: [400, "Invalid date range."],
  ANALYTICS_RANGE_TOO_LARGE: [400, "Date range is too large."],
  FOCUS_SESSION_PROJECT_MISMATCH: [400, "Task belongs to a different project."],
  INVALID_PROJECT_STATE: [409, "Illegal project state transition."],
  INVALID_TASK_STATE: [409, "Illegal task state transition."],
  INVALID_GOAL_STATE: [409, "Illegal goal state transition."],
  INVALID_FOCUS_SESSION_STATE: [409, "Illegal focus session state transition."],
  FOCUS_SESSION_ALREADY_RUNNING: [409, "There is already an active focus session."],
  TASK_HAS_FOCUS_SESSIONS: [409, "Task has focus sessions and cannot be deleted. Cancel it instead."],
};

export const unauthenticated = () => new ApiError(401, "UNAUTHENTICATED", "Authentication required.");
export const accessDenied = () => new ApiError(403, "ACCESS_DENIED", "Access denied.");
export const malformed = () => new ApiError(400, "MALFORMED_REQUEST", "Malformed request.");
export const notFound = () => new ApiError(404, "NOT_FOUND", "Resource not found.");
export const validationError = (message: string) => new ApiError(400, "VALIDATION_ERROR", message);
export const internalError = () => new ApiError(500, "INTERNAL_ERROR", "Unexpected server error.");
