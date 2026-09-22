import { useEffect, useState } from "react";
import type { FocusSessionResponse } from "../api/types";

/** Seconds-left window that triggers the one-minute countdown notice. */
export const COUNTDOWN_NOTICE_THRESHOLD_SECONDS = 60;

/** True exactly when a RUNNING session crosses into its final minute and has not
 * been notified yet. Paused/completed/cancelled sessions and finished time (<= 0)
 * never trigger, and a different session id re-arms the notice. */
export function shouldTriggerCountdownNotice(
  session: FocusSessionResponse | null | undefined,
  remainingSeconds: number,
  notifiedSessionId: number | null,
): boolean {
  return (
    session?.status === "RUNNING" &&
    session.id !== notifiedSessionId &&
    remainingSeconds > 0 &&
    remainingSeconds <= COUNTDOWN_NOTICE_THRESHOLD_SECONDS
  );
}

/** True while the notice for the already-notified session should stay visible. */
export function isCountdownNoticeVisible(
  session: FocusSessionResponse | null | undefined,
  remainingSeconds: number,
  notifiedSessionId: number | null,
): boolean {
  return (
    session?.status === "RUNNING" &&
    session.id === notifiedSessionId &&
    remainingSeconds > 0 &&
    remainingSeconds <= COUNTDOWN_NOTICE_THRESHOLD_SECONDS
  );
}

/** Fires once per session when a RUNNING session enters its final minute.
 * Returns whether the in-app notice should be visible right now. */
export function useCountdownNotice(
  session: FocusSessionResponse | null | undefined,
  remainingSeconds: number,
): boolean {
  const sessionId = session?.id ?? null;
  const [notifiedSessionId, setNotifiedSessionId] = useState<number | null>(null);

  useEffect(() => {
    if (shouldTriggerCountdownNotice(session, remainingSeconds, notifiedSessionId)) {
      setNotifiedSessionId(sessionId);
    }
  }, [session, remainingSeconds, notifiedSessionId]);

  return isCountdownNoticeVisible(session, remainingSeconds, notifiedSessionId);
}
