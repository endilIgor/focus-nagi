import { useEffect, useState } from "react";

/** Ticks every second; used for live wall-clock and elapsed-time displays. */
export function useClockTick(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function pad(n: number): string {
  return String(Math.trunc(n)).padStart(2, "0");
}

export function formatClock(now: Date): string {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

export function formatMinutesAsHm(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h${pad(m)}` : `${m}min`;
}
