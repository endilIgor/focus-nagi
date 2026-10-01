import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { focusSessionsApi } from "../api/focusSessions";
import type { FocusSessionResponse } from "../api/types";

export const CURRENT_FOCUS_SESSION_KEY = ["focus-session", "current"] as const;
export const LAST_COMPLETED_FOCUS_SESSION_KEY = ["focus-session", "last-completed"] as const;
export const FINISH_FOCUS_SESSION_MUTATION_KEY = ["focus-session", "finish"] as const;

export function useCurrentFocusSession() {
  return useQuery<FocusSessionResponse | null>({
    queryKey: CURRENT_FOCUS_SESSION_KEY,
    queryFn: async () => (await focusSessionsApi.current()) ?? null,
    refetchInterval: 20_000,
  });
}

/** Most recent COMPLETED session; its server endedAt is the idle-counter base.
 * History is ordered by startedAt desc and only one session can be active at a
 * time, so the first COMPLETED row is also the last one to end. CANCELLED
 * sessions are excluded on purpose: they never reset the idle base.
 * Polled like the current session so a completion on another device — even
 * one that started and ended between two polls — moves the base here too. */
export function useLastCompletedFocusSession() {
  return useQuery<FocusSessionResponse | null>({
    queryKey: LAST_COMPLETED_FOCUS_SESSION_KEY,
    queryFn: async () =>
      (await focusSessionsApi.list({ status: "COMPLETED", page: 0, size: 1 })).content[0] ?? null,
    refetchInterval: 20_000,
  });
}

/** Applies a finish response to the shared cache: clears the current session
 * and, if the session completed, makes it the idle base right away. In-flight
 * reads are cancelled first so a stale response cannot overwrite the write. */
export async function applyFinishedFocusSession(
  queryClient: QueryClient,
  finished: FocusSessionResponse,
): Promise<void> {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: CURRENT_FOCUS_SESSION_KEY }),
    queryClient.cancelQueries({ queryKey: LAST_COMPLETED_FOCUS_SESSION_KEY }),
  ]);
  queryClient.setQueryData(CURRENT_FOCUS_SESSION_KEY, null);
  if (finished.status === "COMPLETED" && finished.endedAt) {
    queryClient.setQueryData(LAST_COMPLETED_FOCUS_SESSION_KEY, finished);
  }
}

/** Whole seconds since the last COMPLETED session ended. 0 without history or
 * for a missing, invalid or future endedAt. */
export function computeIdleSeconds(
  lastCompleted: FocusSessionResponse | null | undefined,
  nowMs: number,
): number {
  if (!lastCompleted?.endedAt) return 0;
  const seconds = Math.floor((nowMs - Date.parse(lastCompleted.endedAt)) / 1000);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

/** mm:ss, or hh:mm:ss once there are hours (hours never wrap at 24). */
export function formatDuration(totalSeconds: number): string {
  const secs = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function useInvalidateFocusSession() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: CURRENT_FOCUS_SESSION_KEY });
}

/** Elapsed focused seconds right now, mirroring the server's calculation
 * (README: actualFocusSeconds = now - startedAt - pausedSecondsAccum, minus
 * the still-open pause if the session is currently PAUSED). Display-only —
 * the server always recomputes authoritatively on finish. */
export function computeElapsedSeconds(session: FocusSessionResponse, nowMs: number): number {
  const startedMs = Date.parse(session.startedAt);
  const openPauseSeconds =
    session.status === "PAUSED" && session.lastPausedAt
      ? Math.max(0, (nowMs - Date.parse(session.lastPausedAt)) / 1000)
      : 0;
  const totalSeconds = (nowMs - startedMs) / 1000;
  return Math.max(0, Math.round(totalSeconds - session.pausedSecondsAccum - openPauseSeconds));
}
