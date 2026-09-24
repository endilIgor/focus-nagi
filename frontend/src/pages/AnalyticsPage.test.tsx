import { afterEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnalyticsPage } from "./AnalyticsPage";
import { analyticsApi } from "../api/analytics";

vi.mock("../theme/ThemeContext", () => ({ useTheme: () => ({ theme: { acc: "#aaa", acc2: "#bbb", glow: "#ccc", soft: "#ddd" } }) }));
vi.mock("../api/analytics", () => ({ analyticsApi: {
  byDay: vi.fn(async () => [{ date: "2026-09-21", focusedMinutes: 600 }]),
  byHour: vi.fn(async () => []),
  byWeek: vi.fn(async () => []),
  checklistDaily: vi.fn(async () => [{ date: "2026-09-21", total: 4, completed: 3 }]),
  streaks: vi.fn(async () => ({ currentStreak: 1, longestStreak: 2 })),
} }));

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

it("queries the chosen historical ISO week and shows its completed weekly rating", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-29T12:00:00"));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AnalyticsPage /></QueryClientProvider>);
  fireEvent.change(screen.getByLabelText("Selecionar semana"), { target: { value: "2026-W39" } });
  await waitFor(() => expect(analyticsApi.byDay).toHaveBeenCalledWith("2026-09-21", "2026-09-27"));
  await waitFor(() => expect(screen.getByText(/excelente/i)).toBeTruthy());
  expect(screen.queryByText(/Foco por projeto/i)).toBeNull();
});

it("queries the chosen month for all focus charts", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-29T12:00:00"));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AnalyticsPage /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: /mês/i }));
  fireEvent.change(screen.getByLabelText("Selecionar mês"), { target: { value: "2026-08" } });
  await waitFor(() => expect(analyticsApi.byHour).toHaveBeenCalledWith("2026-08-01", "2026-08-31"));
  expect(screen.queryByText(/14d|30d/)).toBeNull();
});

it("shows this week's provisional grade on the weekend using data through today", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-26T12:00:00"));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AnalyticsPage /></QueryClientProvider>);
  await waitFor(() => expect(analyticsApi.checklistDaily).toHaveBeenCalledWith("2026-09-21", "2026-09-26"));
  expect(await screen.findByText(/avaliação parcial/i)).toBeInTheDocument();
  expect(screen.getByText("EXCELENTE")).toBeInTheDocument();
});
