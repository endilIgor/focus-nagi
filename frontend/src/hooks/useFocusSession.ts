import { useQuery, useQueryClient } from "@tanstack/react-query";
import { focusSessionsApi } from "../api/focusSessions";
import type { FocusSessionResponse } from "../api/types";

export const CURRENT_FOCUS_SESSION_KEY = ["focus-session", "current"] as const;

export function useCurrentFocusSession() {
  return useQuery<FocusSessionResponse | undefined>({
    queryKey: CURRENT_FOCUS_SESSION_KEY,
    queryFn: () => focusSessionsApi.current(),
    refetchInterval: 20_000,
  });
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
