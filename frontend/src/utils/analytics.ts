import type { HourFocusResponse } from "../api/types";

export function fillHourlyFocus(hours: HourFocusResponse[]): HourFocusResponse[] {
  const minutesByHour = new Map(hours.map((entry) => [entry.hour, entry.focusedMinutes]));

  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    focusedMinutes: minutesByHour.get(hour) ?? 0,
  }));
}
