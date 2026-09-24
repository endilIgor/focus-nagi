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

it("navigates to the previous week via an accessible button, without exposing the ISO week code, and shows its completed weekly rating", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-29T12:00:00"));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AnalyticsPage /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: /semana anterior/i }));
  await waitFor(() => expect(analyticsApi.byDay).toHaveBeenCalledWith("2026-09-21", "2026-09-27"));
  expect(screen.getByText(/21 a 27 de set de 2026/i)).toBeInTheDocument();
  expect(screen.queryByText(/2026-w/i)).toBeNull();
  await waitFor(() => expect(screen.getByText(/excelente/i)).toBeTruthy());
  expect(screen.queryByText(/Foco por projeto/i)).toBeNull();
});

it("jumps straight to an old week via the optional date field, skipping intermediate weeks", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-29T12:00:00"));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AnalyticsPage /></QueryClientProvider>);
  fireEvent.change(screen.getByLabelText(/pular para/i), { target: { value: "2026-08-05" } });
  await waitFor(() => expect(analyticsApi.byDay).toHaveBeenCalledWith("2026-08-03", "2026-08-09"));
  expect(screen.getByText(/03 a 09 de ago de 2026/i)).toBeInTheDocument();
});

it("disables moving to a future week once the current week is reached", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-29T12:00:00"));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AnalyticsPage /></QueryClientProvider>);
  expect(screen.getByRole("button", { name: /próxima semana/i })).toBeDisabled();
});

it("no longer shows the internal scoring thresholds text", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-26T12:00:00"));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AnalyticsPage /></QueryClientProvider>);
  await screen.findByText(/avaliação parcial/i);
  expect(screen.queryByText(/Critério: foco/i)).toBeNull();
});

it("clearing the jump-to-date field does not trigger invalid queries nor change the selected week", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-29T12:00:00"));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AnalyticsPage /></QueryClientProvider>);
  await waitFor(() => expect(analyticsApi.byDay).toHaveBeenCalledWith("2026-09-28", "2026-09-29"));
  const callsBefore = vi.mocked(analyticsApi.byDay).mock.calls.length;

  fireEvent.change(screen.getByLabelText(/pular para/i), { target: { value: "" } });

  expect(screen.getByText(/28 de set a 04 de out de 2026/i)).toBeInTheDocument();
  expect(vi.mocked(analyticsApi.byDay).mock.calls.length).toBe(callsBefore);
  expect(vi.mocked(analyticsApi.byDay).mock.calls.some(([from, to]) => from?.includes("NaN") || to?.includes("NaN"))).toBe(false);
});

it("shows only the human-readable week range, not a raw ISO date span, for the week period", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-29T12:00:00"));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AnalyticsPage /></QueryClientProvider>);
  await waitFor(() => expect(analyticsApi.byDay).toHaveBeenCalledWith("2026-09-28", "2026-09-29"));
  expect(screen.getByText(/28 de set a 04 de out de 2026/i)).toBeInTheDocument();
  expect(screen.queryByText("2026-09-28 — 2026-09-29")).toBeNull();
});

it("shows a readable month rather than a raw ISO range, while today keeps its date range", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-29T12:00:00"));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AnalyticsPage /></QueryClientProvider>);

  fireEvent.click(screen.getByRole("button", { name: /^mês$/i }));
  expect(screen.getByText("setembro de 2026")).toBeInTheDocument();
  expect(screen.queryByText("2026-09-01 — 2026-09-29")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: /^hoje$/i }));
  await waitFor(() => expect(screen.getByText("2026-09-29 — 2026-09-29")).toBeInTheDocument());
});

it("navigates across an ISO year boundary via the previous-week button with correct queries and label", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2021-01-04T12:00:00"));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AnalyticsPage /></QueryClientProvider>);
  await waitFor(() => expect(analyticsApi.byDay).toHaveBeenCalledWith("2021-01-04", "2021-01-04"));

  fireEvent.click(screen.getByRole("button", { name: /semana anterior/i }));

  await waitFor(() => expect(analyticsApi.byDay).toHaveBeenCalledWith("2020-12-28", "2021-01-03"));
  expect(screen.getByText(/28 de dez de 2020 a 03 de jan de 2021/i)).toBeInTheDocument();
});

it("queries the chosen month for all focus charts", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-29T12:00:00"));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AnalyticsPage /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: /mês/i }));
  fireEvent.click(screen.getByRole("button", { name: /mês anterior/i }));
  await waitFor(() => expect(analyticsApi.byHour).toHaveBeenCalledWith("2026-08-01", "2026-08-31"));
  expect(screen.getByText("agosto de 2026")).toBeInTheDocument();
  expect(screen.queryByText(/14d|30d/)).toBeNull();
});

it("opens a calendar to jump directly to a month and navigates back through the year boundary", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-29T12:00:00"));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AnalyticsPage /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: /^mês$/i }));
  const picker = screen.getByLabelText("Data para selecionar mês") as HTMLInputElement;
  expect(picker.type).toBe("date");
  const showPicker = vi.fn();
  picker.showPicker = showPicker;
  fireEvent.click(screen.getByRole("button", { name: /abrir calendário de meses/i }));
  expect(showPicker).toHaveBeenCalledOnce();
  fireEvent.change(picker, { target: { value: "2026-01-15" } });
  await waitFor(() => expect(analyticsApi.byDay).toHaveBeenCalledWith("2026-01-01", "2026-01-31"));
  fireEvent.click(screen.getByRole("button", { name: /mês anterior/i }));
  await waitFor(() => expect(analyticsApi.byDay).toHaveBeenCalledWith("2025-12-01", "2025-12-31"));
  expect(screen.getByText("dezembro de 2025")).toBeInTheDocument();
});

it("does not navigate into future months or query an empty calendar selection", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-29T12:00:00"));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AnalyticsPage /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: /^mês$/i }));
  expect(screen.getByRole("button", { name: /próximo mês/i })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /mês anterior/i }));
  fireEvent.click(screen.getByRole("button", { name: /próximo mês/i }));
  expect(screen.getByRole("button", { name: /próximo mês/i })).toBeDisabled();
  await waitFor(() => expect(analyticsApi.byDay).toHaveBeenCalledWith("2026-09-01", "2026-09-29"));
  fireEvent.change(screen.getByLabelText("Data para selecionar mês"), { target: { value: "" } });
  expect(screen.getByText("setembro de 2026")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Data para selecionar mês"), { target: { value: "2026-10-01" } });
  expect(screen.getByText("setembro de 2026")).toBeInTheDocument();
  expect(vi.mocked(analyticsApi.byDay).mock.calls.some(([from, to]) => from?.includes("NaN") || to?.includes("NaN"))).toBe(false);
});

it("shows this week's provisional grade on the weekend using data through today", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-26T12:00:00"));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AnalyticsPage /></QueryClientProvider>);
  await waitFor(() => expect(analyticsApi.checklistDaily).toHaveBeenCalledWith("2026-09-21", "2026-09-26"));
  expect(await screen.findByText(/avaliação parcial/i)).toBeInTheDocument();
  expect(screen.getByText("EXCELENTE")).toBeInTheDocument();
});
