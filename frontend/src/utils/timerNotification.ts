const COMPLETION_TITLE = "Focus Nagi";
const COMPLETION_BODY = "Sessão de foco concluída! Hora de fazer uma pausa.";

/** Requests notification permission from a user gesture when it is still undecided. */
export async function requestTimerNotificationPermission(): Promise<NotificationPermission | null> {
  if (!("Notification" in window)) return null;
  if (Notification.permission !== "default") return Notification.permission;

  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Shows the native browser notification when permission has already been granted. */
export function showTimerCompletionNotification(): Notification | null {
  if (!("Notification" in window) || Notification.permission !== "granted") return null;

  const notification = new Notification(COMPLETION_TITLE, {
    body: COMPLETION_BODY,
    icon: "/favicon.svg",
    tag: "focus-nagi-timer-complete",
    requireInteraction: true,
  });

  notification.onclick = () => {
    window.focus();
    notification.close();
  };

  return notification;
}
