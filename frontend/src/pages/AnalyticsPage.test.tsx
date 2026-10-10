import { afterEach, expect, it, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnalyticsPage } from "./AnalyticsPage";
import { analyticsApi } from "../api/analytics";
import type { DayFocusResponse } from "../api/types";
import analyticsCss from "./AnalyticsPage.module.css?raw";

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
  expect(screen.getByText("Excelente.")).toBeInTheDocument();
});

it("lays out the v3 telemetry hero, glass summary and real charts without replacing the period data", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-29T12:00:00"));
  vi.mocked(analyticsApi.byDay).mockResolvedValue([
    { date: "2026-09-28", focusedMinutes: 600 },
    { date: "2026-09-29", focusedMinutes: 0 },
  ]);
  vi.mocked(analyticsApi.byHour).mockResolvedValue([{ hour: 9, focusedMinutes: 600 }]);
  const { container } = render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AnalyticsPage /></QueryClientProvider>);

  expect(screen.getByRole("heading", { level: 1, name: "Analytics." })).toBeInTheDocument();
  expect(screen.getByText("Telemetria")).toBeInTheDocument();
  const anchors = container.querySelectorAll("[data-particle-anchor]");
  expect(anchors).toHaveLength(1);
  expect(anchors[0]).toHaveAttribute("data-shape", "cloud");
  expect(screen.queryByTestId("particle-scene")).toBeNull();
  expect(screen.getByRole("button", { name: "Semana" })).toHaveAttribute("aria-pressed", "true");

  const summary = screen.getByRole("region", { name: "Resumo do período" });
  const cards = within(summary).getAllByRole("article");
  expect(cards).toHaveLength(4);
  expect(await within(cards[0]).findByText("10h00")).toBeInTheDocument();
  expect(await within(cards[1]).findByText("3/4")).toBeInTheDocument();
  expect(await within(cards[2]).findByText("1d")).toBeInTheDocument();
  expect(await within(cards[3]).findByText("09h")).toBeInTheDocument();

  const heat = screen.getByRole("region", { name: "Mapa de foco" });
  expect(within(heat).getByRole("heading", { level: 2, name: "Mapa de foco" })).toBeInTheDocument();
  // Map days are named buttons (date · duration) instead of hover-only titles.
  expect(await within(heat).findByRole("button", { name: "28 de setembro de 2026 · 10h" })).toBeInTheDocument();
  expect(within(heat).getByRole("button", { name: "29 de setembro de 2026 · 0min" })).toBeInTheDocument();

  const byDay = screen.getByRole("region", { name: "Foco por dia" });
  expect(within(byDay).getByRole("heading", { level: 2, name: "Foco por dia" })).toBeInTheDocument();
  expect(within(byDay).getByText("10h")).toBeInTheDocument();
  const byHour = screen.getByRole("region", { name: "Por hora do dia" });
  expect(within(byHour).getAllByTitle(/^\d{2}h · \d+ min$/)).toHaveLength(24);
  expect(within(byHour).getByTitle("09h · 600 min")).toBeInTheDocument();
});

function barHeight(column: HTMLElement): string {
  return (column.querySelector("div") as HTMLElement).style.height;
}

it("labels the daily focus bars with explicit hour/minute units while keeping bar heights proportional to minutes", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-29T12:00:00"));
  vi.mocked(analyticsApi.byDay).mockResolvedValue([
    { date: "2026-09-22", focusedMinutes: 90 },
    { date: "2026-09-23", focusedMinutes: 60 },
    { date: "2026-09-24", focusedMinutes: 30 },
    { date: "2026-09-25", focusedMinutes: 0 },
  ]);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AnalyticsPage /></QueryClientProvider>);

  const byDay = screen.getByRole("region", { name: "Foco por dia" });
  const mixed = await within(byDay).findByTitle("2026-09-22 · 1h 30min");
  const exact = within(byDay).getByTitle("2026-09-23 · 1h");
  const short = within(byDay).getByTitle("2026-09-24 · 30min");
  const zero = within(byDay).getByTitle("2026-09-25 · 0min");

  expect(within(mixed).getByText("1h 30min")).toBeInTheDocument();
  expect(within(exact).getByText("1h")).toBeInTheDocument();
  expect(within(short).getByText("30min")).toBeInTheDocument();
  expect((zero.querySelector("span") as HTMLElement).textContent).toBe("");
  expect(within(byDay).queryByText("90")).toBeNull();
  expect(within(byDay).queryByText("60")).toBeNull();
  expect(within(byDay).queryByText("30")).toBeNull();

  expect(barHeight(mixed)).toBe("100%");
  expect(barHeight(exact)).toBe("67%");
  expect(barHeight(short)).toBe("33%");
  expect(barHeight(zero)).toBe("0%");

  const heat = screen.getByRole("region", { name: "Mapa de foco" });
  expect(await within(heat).findByRole("button", { name: "22 de setembro de 2026 · 1h 30min" })).toBeInTheDocument();
  expect(within(heat).getByRole("button", { name: "25 de setembro de 2026 · 0min" })).toBeInTheDocument();
  const summary = screen.getByRole("region", { name: "Resumo do período" });
  expect(within(summary).getByText("3h00")).toBeInTheDocument();
});

it("shows aggregated daily durations above 24 hours without wrapping back to zero", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-29T12:00:00"));
  vi.mocked(analyticsApi.byDay).mockResolvedValue([
    { date: "2026-09-22", focusedMinutes: 1530 },
    { date: "2026-09-23", focusedMinutes: 1440 },
    { date: "2026-09-24", focusedMinutes: 765 },
  ]);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AnalyticsPage /></QueryClientProvider>);

  const byDay = screen.getByRole("region", { name: "Foco por dia" });
  const overDay = await within(byDay).findByTitle("2026-09-22 · 25h 30min");
  const fullDay = within(byDay).getByTitle("2026-09-23 · 24h");
  const halfDay = within(byDay).getByTitle("2026-09-24 · 12h 45min");

  expect(within(overDay).getByText("25h 30min")).toBeInTheDocument();
  expect(within(fullDay).getByText("24h")).toBeInTheDocument();
  expect(within(halfDay).getByText("12h 45min")).toBeInTheDocument();
  expect(within(byDay).queryByText("1h 30min")).toBeNull();
  expect(within(byDay).queryByText("0min")).toBeNull();

  expect(barHeight(overDay)).toBe("100%");
  expect(barHeight(fullDay)).toBe("94%");
  expect(barHeight(halfDay)).toBe("50%");
});

// ---- monthly focus map (own month, fixed levels, accessible days) ----

interface Deferred<T> { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void }
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

type DayAnswer = DayFocusResponse[] | Promise<DayFocusResponse[]>;

/** Each by-day range answers only with its own records (unknown ranges are empty). */
function mockMapApis(byRange: Record<string, DayAnswer | (() => DayAnswer)>) {
  vi.mocked(analyticsApi.byDay).mockImplementation(async (from, to) => {
    const answer = byRange[`${from}..${to}`];
    return (typeof answer === "function" ? answer() : answer) ?? [];
  });
  vi.mocked(analyticsApi.byHour).mockResolvedValue([]);
  vi.mocked(analyticsApi.byWeek).mockResolvedValue([]);
  vi.mocked(analyticsApi.checklistDaily).mockResolvedValue([{ date: "2026-09-21", total: 4, completed: 3 }]);
}

function renderAnalytics(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(<QueryClientProvider client={client}><AnalyticsPage /></QueryClientProvider>);
  return client;
}

const heatRegion = () => screen.getByRole("region", { name: "Mapa de foco" });
const heatDays = () => within(heatRegion()).queryAllByRole("button", { name: / · / });
const heatDetails = () => within(heatRegion()).queryByRole("region", { name: "Detalhes do dia" });

it("keeps the map on the whole current month whatever the Today/Week filters or the charts' month", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-29T12:00:00"));
  mockMapApis({
    "2026-09-01..2026-09-29": [{ date: "2026-09-03", focusedMinutes: 45 }, { date: "2026-09-28", focusedMinutes: 600 }],
    "2026-09-28..2026-09-29": [{ date: "2026-09-28", focusedMinutes: 600 }],
    "2026-08-01..2026-08-31": [{ date: "2026-08-10", focusedMinutes: 30 }],
  });
  renderAnalytics();

  const heat = heatRegion();
  expect(await within(heat).findByRole("button", { name: "3 de setembro de 2026 · 45min" })).toBeInTheDocument();
  expect(within(heat).getByText("Setembro de 2026")).toBeInTheDocument();
  expect(heatDays()).toHaveLength(30);
  expect(analyticsApi.byDay).toHaveBeenCalledWith("2026-09-01", "2026-09-29");

  fireEvent.click(screen.getByRole("button", { name: /^hoje$/i }));
  await waitFor(() => expect(analyticsApi.byDay).toHaveBeenCalledWith("2026-09-29", "2026-09-29"));
  expect(heatDays()).toHaveLength(30);
  expect(within(heat).getByRole("button", { name: "3 de setembro de 2026 · 45min" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /^mês$/i }));
  fireEvent.click(screen.getByRole("button", { name: /mês anterior/i }));
  await waitFor(() => expect(analyticsApi.byHour).toHaveBeenCalledWith("2026-08-01", "2026-08-31"));
  expect(within(heat).getByText("Setembro de 2026")).toBeInTheDocument();
  expect(heatDays()).toHaveLength(30);
  expect(within(heat).queryByRole("button", { name: /agosto/ })).toBeNull();
});

it("navigates the map month on its own without changing the summary, the weekly rating or the other charts", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-29T12:00:00"));
  mockMapApis({
    "2026-09-28..2026-09-29": [{ date: "2026-09-28", focusedMinutes: 600 }],
    "2026-09-21..2026-09-27": [{ date: "2026-09-22", focusedMinutes: 600 }],
    "2026-09-01..2026-09-29": [{ date: "2026-09-22", focusedMinutes: 600 }, { date: "2026-09-28", focusedMinutes: 600 }],
    "2026-08-01..2026-08-31": [{ date: "2026-08-10", focusedMinutes: 30 }],
  });
  renderAnalytics();

  const summary = screen.getByRole("region", { name: "Resumo do período" });
  expect(await within(summary).findByText("10h00")).toBeInTheDocument();
  expect(await screen.findByText("Excelente.")).toBeInTheDocument();
  await within(heatRegion()).findByRole("button", { name: "28 de setembro de 2026 · 10h" });
  const hourCalls = vi.mocked(analyticsApi.byHour).mock.calls.length;
  const checklistCalls = vi.mocked(analyticsApi.checklistDaily).mock.calls.length;

  const heat = heatRegion();
  expect(within(heat).getByRole("button", { name: /seguinte/i })).toBeDisabled();
  fireEvent.click(within(heat).getByRole("button", { name: /anterior/i }));

  expect(await within(heat).findByRole("button", { name: "10 de agosto de 2026 · 30min" })).toBeInTheDocument();
  expect(within(heat).getByText("Agosto de 2026")).toBeInTheDocument();
  expect(heatDays()).toHaveLength(31);
  expect(analyticsApi.byDay).toHaveBeenCalledWith("2026-08-01", "2026-08-31");

  expect(within(summary).getByText("10h00")).toBeInTheDocument();
  expect(screen.getByText("Excelente.")).toBeInTheDocument();
  expect(screen.getByText(/28 de set a 04 de out de 2026/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Semana" })).toHaveAttribute("aria-pressed", "true");
  expect(within(screen.getByRole("region", { name: "Foco por dia" })).getByText("10h")).toBeInTheDocument();
  expect(vi.mocked(analyticsApi.byHour).mock.calls.length).toBe(hourCalls);
  expect(vi.mocked(analyticsApi.checklistDaily).mock.calls.length).toBe(checklistCalls);
  expect(analyticsApi.byHour).not.toHaveBeenCalledWith("2026-08-01", "2026-08-31");

  fireEvent.click(within(heat).getByRole("button", { name: /seguinte/i }));
  expect(await within(heat).findByText("Setembro de 2026")).toBeInTheDocument();
  expect(within(heat).getByRole("button", { name: /seguinte/i })).toBeDisabled();
});

it("crosses the year boundary in the map and never queries a future month", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-01-15T12:00:00"));
  mockMapApis({ "2025-12-01..2025-12-31": [{ date: "2025-12-31", focusedMinutes: 125 }] });
  renderAnalytics();

  const heat = heatRegion();
  await within(heat).findByRole("button", { name: "15 de janeiro de 2026 · 0min" });
  fireEvent.click(within(heat).getByRole("button", { name: /anterior/i }));
  expect(await within(heat).findByRole("button", { name: "31 de dezembro de 2025 · 2h 5min" })).toBeInTheDocument();
  expect(within(heat).getByText("Dezembro de 2025")).toBeInTheDocument();
  expect(analyticsApi.byDay).toHaveBeenCalledWith("2025-12-01", "2025-12-31");

  fireEvent.click(within(heat).getByRole("button", { name: /seguinte/i }));
  expect(await within(heat).findByText("Janeiro de 2026")).toBeInTheDocument();
  expect(within(heat).getByRole("button", { name: /seguinte/i })).toBeDisabled();
  fireEvent.click(within(heat).getByRole("button", { name: /seguinte/i }));
  expect(within(heat).getByText("Janeiro de 2026")).toBeInTheDocument();

  await within(heat).findByRole("button", { name: "15 de janeiro de 2026 · 0min" });
  expect(heatDays()).toHaveLength(31);
  const future = heatDays().filter((day) => day.dataset.future === "true");
  expect(future).toHaveLength(16);
  expect(future[0]).toHaveAccessibleName("16 de janeiro de 2026 · dia futuro, sem registro");
  expect(vi.mocked(analyticsApi.byDay).mock.calls.some(([from]) => (from ?? "") > "2026-01-31")).toBe(false);
});

it("lays out leap February in Monday–Sunday rows with inert padding and fixed intensity levels", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2024-03-10T12:00:00"));
  mockMapApis({
    "2024-02-01..2024-02-29": [
      { date: "2024-02-05", focusedMinutes: 59 },
      { date: "2024-02-06", focusedMinutes: 60 },
      { date: "2024-02-07", focusedMinutes: 119 },
      { date: "2024-02-08", focusedMinutes: 120 },
      { date: "2024-02-09", focusedMinutes: 239 },
      { date: "2024-02-10", focusedMinutes: 240 },
      { date: "2024-02-12", focusedMinutes: 1 },
    ],
  });
  renderAnalytics();

  const heat = heatRegion();
  await within(heat).findByRole("button", { name: "10 de março de 2024 · 0min" });
  fireEvent.click(within(heat).getByRole("button", { name: /anterior/i }));
  await within(heat).findByRole("button", { name: "5 de fevereiro de 2024 · 59min" });
  expect(heatDays()).toHaveLength(29);

  // Column-major cells: week columns of seven Monday–Sunday rows; Feb 1st 2024 is a Thursday.
  const cells = Array.from(heat.querySelectorAll<HTMLElement>("[data-heat-cell]"));
  expect(cells).toHaveLength(35);
  expect(cells.map((cell) => cell.dataset.row)).toEqual(Array.from({ length: 35 }, (_, index) => String(index % 7)));
  expect(cells[3]).toHaveAccessibleName("1 de fevereiro de 2024 · 0min");
  expect(cells[6]).toHaveAccessibleName("4 de fevereiro de 2024 · 0min");
  expect(cells[7]).toHaveAccessibleName("5 de fevereiro de 2024 · 59min");
  expect(cells[31]).toHaveAccessibleName("29 de fevereiro de 2024 · 0min");

  const padding = [0, 1, 2, 32, 33, 34].map((index) => cells[index]);
  for (const cell of padding) {
    expect(cell.tagName).not.toBe("BUTTON");
    expect(cell).toHaveAttribute("aria-hidden", "true");
    expect(cell).not.toHaveAttribute("tabindex");
    expect(cell).not.toHaveAttribute("data-level");
    expect(cell.textContent).toBe("");
    fireEvent.click(cell);
  }
  expect(within(heatDetails()!).getByText(/selecione um dia/i)).toBeInTheDocument();

  const daysByName = new Map(heatDays().map((day) => [day.getAttribute("aria-label"), day]));
  const level = (name: string) => daysByName.get(name)?.dataset.level;
  expect(level("4 de fevereiro de 2024 · 0min")).toBe("0");
  expect(level("5 de fevereiro de 2024 · 59min")).toBe("1");
  expect(level("6 de fevereiro de 2024 · 1h")).toBe("2");
  expect(level("7 de fevereiro de 2024 · 1h 59min")).toBe("2");
  expect(level("8 de fevereiro de 2024 · 2h")).toBe("3");
  expect(level("9 de fevereiro de 2024 · 3h 59min")).toBe("3");
  expect(level("10 de fevereiro de 2024 · 4h")).toBe("4");
  expect(level("12 de fevereiro de 2024 · 1min")).toBe("1");
  expect(heatDays().some((day) => day.dataset.future === "true")).toBe(false);
});

it("uses the same fixed legend and level for equal minutes in quiet and busy months, without goals", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-29T12:00:00"));
  mockMapApis({
    "2026-09-01..2026-09-29": [{ date: "2026-09-03", focusedMinutes: 30 }, { date: "2026-09-28", focusedMinutes: 600 }],
    "2026-08-01..2026-08-31": [{ date: "2026-08-10", focusedMinutes: 30 }],
  });
  renderAnalytics();

  const heat = heatRegion();
  const legendTexts = () => Array.from(within(heat).getByRole("list", { name: "Legenda de intensidade" }).querySelectorAll("li"), (item) => item.textContent);
  const expectedLegend = ["0min", "1–59min", "60–119min", "120–239min", "240min ou mais", "Futuro"];

  expect((await within(heat).findByRole("button", { name: "3 de setembro de 2026 · 30min" })).dataset.level).toBe("1");
  expect(heatDays().find((day) => day.getAttribute("aria-label") === "28 de setembro de 2026 · 10h")?.dataset.level).toBe("4");
  expect(legendTexts()).toEqual(expectedLegend);
  expect(within(heat).queryByText(/meta/i)).toBeNull();

  fireEvent.click(within(heat).getByRole("button", { name: /anterior/i }));
  expect((await within(heat).findByRole("button", { name: "10 de agosto de 2026 · 30min" })).dataset.level).toBe("1");
  expect(legendTexts()).toEqual(expectedLegend);
});

it("selects map days by mouse, touch, Enter and Space, showing date and duration and an explicit future state", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-29T12:00:00"));
  mockMapApis({ "2026-09-01..2026-09-29": [{ date: "2026-09-03", focusedMinutes: 90 }, { date: "2026-09-05", focusedMinutes: 25 }] });
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  renderAnalytics();

  const heat = heatRegion();
  const mouseDay = await within(heat).findByRole("button", { name: "3 de setembro de 2026 · 1h 30min" });
  const details = heatDetails()!;
  expect(details).toHaveAttribute("aria-live", "polite");
  expect(within(details).getByText(/selecione um dia/i)).toBeInTheDocument();

  await user.click(mouseDay);
  expect(mouseDay).toHaveAttribute("aria-pressed", "true");
  expect(within(details).getByText("quinta-feira, 3 de setembro de 2026")).toBeInTheDocument();
  expect(within(details).getByText("1h 30min")).toBeInTheDocument();

  const touchDay = within(heat).getByRole("button", { name: "5 de setembro de 2026 · 25min" });
  await user.pointer({ keys: "[TouchA]", target: touchDay });
  expect(touchDay).toHaveAttribute("aria-pressed", "true");
  expect(within(details).getByText("sábado, 5 de setembro de 2026")).toBeInTheDocument();
  expect(within(details).getByText("25min")).toBeInTheDocument();

  const enterDay = within(heat).getByRole("button", { name: "4 de setembro de 2026 · 0min" });
  enterDay.focus();
  await user.keyboard("{Enter}");
  expect(enterDay).toHaveAttribute("aria-pressed", "true");
  expect(mouseDay).toHaveAttribute("aria-pressed", "false");
  expect(touchDay).toHaveAttribute("aria-pressed", "false");
  expect(within(details).getByText("sexta-feira, 4 de setembro de 2026")).toBeInTheDocument();
  expect(within(details).getByText("0min")).toBeInTheDocument();

  const futureDay = within(heat).getByRole("button", { name: "30 de setembro de 2026 · dia futuro, sem registro" });
  expect(futureDay).toHaveAttribute("data-future", "true");
  expect(futureDay).not.toHaveAttribute("data-level");
  futureDay.focus();
  await user.keyboard(" ");
  expect(futureDay).toHaveAttribute("aria-pressed", "true");
  expect(within(details).getByText("quarta-feira, 30 de setembro de 2026")).toBeInTheDocument();
  expect(within(details).getByText("Dia futuro, sem registro ainda")).toBeInTheDocument();
  expect(within(details).queryByText("0min")).toBeNull();
});

it("shows loading instead of a zero map, and an error with retry instead of zeros", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-29T12:00:00"));
  const pending = deferred<DayFocusResponse[]>();
  let september: () => DayAnswer = () => pending.promise;
  mockMapApis({ "2026-09-01..2026-09-29": () => september() });
  renderAnalytics();

  const heat = heatRegion();
  expect(await within(heat).findByRole("status")).toHaveTextContent(/carregando mapa/i);
  expect(heatDays()).toHaveLength(0);
  expect(heatDetails()).toBeNull();
  expect(within(heat).queryByText("0min")).toBeNull();

  await act(async () => pending.reject(new Error("Falha ao carregar o mapa")));
  const alert = await within(heat).findByRole("alert");
  expect(alert).toHaveTextContent("Falha ao carregar o mapa");
  expect(heatDays()).toHaveLength(0);
  expect(heatDetails()).toBeNull();
  expect(within(heat).queryByRole("status")).toBeNull();

  september = () => [{ date: "2026-09-03", focusedMinutes: 45 }];
  fireEvent.click(within(alert).getByRole("button", { name: "Tentar novamente" }));
  expect(await within(heat).findByRole("button", { name: "3 de setembro de 2026 · 45min" })).toBeInTheDocument();
  expect(heatDays()).toHaveLength(30);
  expect(within(heat).queryByRole("alert")).toBeNull();
});

it("never shows the previous month's days or selection while another month loads or fails, and resets the selection", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-29T12:00:00"));
  const august = deferred<DayFocusResponse[]>();
  mockMapApis({
    "2026-09-01..2026-09-29": [{ date: "2026-09-03", focusedMinutes: 45 }],
    "2026-08-01..2026-08-31": () => august.promise,
  });
  renderAnalytics();

  const heat = heatRegion();
  fireEvent.click(await within(heat).findByRole("button", { name: "3 de setembro de 2026 · 45min" }));
  expect(within(heatDetails()!).getByText("quinta-feira, 3 de setembro de 2026")).toBeInTheDocument();

  fireEvent.click(within(heat).getByRole("button", { name: /anterior/i }));
  expect(within(heat).getByText("Agosto de 2026")).toBeInTheDocument();
  expect(within(heat).getByRole("status")).toHaveTextContent(/carregando mapa/i);
  expect(heatDays()).toHaveLength(0);
  expect(heatDetails()).toBeNull();
  expect(within(heat).queryByText(/setembro/)).toBeNull();

  await act(async () => august.reject(new Error("Agosto indisponível")));
  expect(await within(heat).findByRole("alert")).toHaveTextContent("Agosto indisponível");
  expect(heatDays()).toHaveLength(0);
  expect(within(heat).queryByText(/setembro/)).toBeNull();

  fireEvent.click(within(heat).getByRole("button", { name: /seguinte/i }));
  expect(await within(heat).findByRole("button", { name: "3 de setembro de 2026 · 45min" })).toHaveAttribute("aria-pressed", "false");
  expect(within(heatDetails()!).getByText(/selecione um dia/i)).toBeInTheDocument();
});

it("ignores late responses from months navigated away from during rapid switching", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-29T12:00:00"));
  const august = deferred<DayFocusResponse[]>();
  const july = deferred<DayFocusResponse[]>();
  mockMapApis({
    "2026-09-01..2026-09-29": [{ date: "2026-09-03", focusedMinutes: 45 }],
    "2026-08-01..2026-08-31": () => august.promise,
    "2026-07-01..2026-07-31": () => july.promise,
  });
  renderAnalytics();

  const heat = heatRegion();
  await within(heat).findByRole("button", { name: "3 de setembro de 2026 · 45min" });
  fireEvent.click(within(heat).getByRole("button", { name: /anterior/i }));
  fireEvent.click(within(heat).getByRole("button", { name: /anterior/i }));
  expect(within(heat).getByText("Julho de 2026")).toBeInTheDocument();
  await waitFor(() => expect(analyticsApi.byDay).toHaveBeenCalledWith("2026-07-01", "2026-07-31"));

  await act(async () => august.resolve([{ date: "2026-08-10", focusedMinutes: 30 }]));
  expect(within(heat).getByRole("status")).toHaveTextContent(/carregando mapa/i);
  expect(heatDays()).toHaveLength(0);

  await act(async () => july.resolve([{ date: "2026-07-04", focusedMinutes: 60 }]));
  expect(await within(heat).findByRole("button", { name: "4 de julho de 2026 · 1h" })).toBeInTheDocument();
  expect(heatDays()).toHaveLength(31);
  expect(within(heat).queryByRole("button", { name: /agosto/ })).toBeNull();
  expect(within(heat).getByText("Julho de 2026")).toBeInTheDocument();
});

it("shares one by-day cache entry with the month chart for the same range and refreshes after focus invalidation", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-29T12:00:00"));
  const first = deferred<DayFocusResponse[]>();
  let september: () => DayAnswer = () => first.promise;
  mockMapApis({ "2026-09-01..2026-09-29": () => september() });
  const client = renderAnalytics();
  const septemberCalls = () => vi.mocked(analyticsApi.byDay).mock.calls.filter(([from, to]) => from === "2026-09-01" && to === "2026-09-29").length;

  await waitFor(() => expect(septemberCalls()).toBe(1));
  fireEvent.click(screen.getByRole("button", { name: /^mês$/i }));
  await act(async () => first.resolve([{ date: "2026-09-03", focusedMinutes: 45 }]));

  const heat = heatRegion();
  expect(await within(heat).findByRole("button", { name: "3 de setembro de 2026 · 45min" })).toBeInTheDocument();
  expect(await within(screen.getByRole("region", { name: "Resumo do período" })).findByText("45min")).toBeInTheDocument();
  expect(septemberCalls()).toBe(1);
  expect(client.getQueryCache().findAll({ queryKey: ["analytics", "by-day", "2026-09-01", "2026-09-29"], exact: true })).toHaveLength(1);

  september = () => [{ date: "2026-09-03", focusedMinutes: 45 }, { date: "2026-09-29", focusedMinutes: 25 }];
  await act(async () => { await client.invalidateQueries({ queryKey: ["analytics"] }); });
  expect(await within(heat).findByRole("button", { name: "29 de setembro de 2026 · 25min" })).toBeInTheDocument();
});

// Top-level (non-media) rule body; rules inside @media are indented and never match.
function baseRule(selector: string): { index: number; body: string } {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^${escaped} \\{([^}]*)\\}`, "m").exec(analyticsCss);
  expect(match, `missing base rule ${selector}`).not.toBeNull();
  return { index: match!.index, body: match![1] };
}

it("keeps the selection ring on a selected future heat cell", () => {
  const future = baseRule('.heatCell[data-future="true"],\n.heatSwatch[data-future="true"]');
  const selected = baseRule('.heatCell[aria-pressed="true"]');
  expect(future.body).toMatch(/box-shadow:\s*none/);
  expect(selected.body).toMatch(/box-shadow:\s*0 0 0 2px var\(--bg\), 0 0 0 4px #fff/);
  // Same specificity: the selected ring must come later to win over the future reset.
  expect(selected.index).toBeGreaterThan(future.index);
});

it("keeps whole day-bar durations on one line in fixed-width columns that scroll inside the panel", () => {
  expect(baseRule(".dayBarValue").body).toMatch(/white-space:\s*nowrap/);
  const column = baseRule(".dayBarCol").body;
  expect(column).toMatch(/flex:\s*1 0 auto/);
  const minWidth = /min-width:\s*(\d+)px/.exec(column);
  expect(minWidth).not.toBeNull();
  // "1h 30min" is ~57px at 13px Geist; leave room for the longest "23h 59min".
  expect(Number(minWidth![1])).toBeGreaterThanOrEqual(64);
  const panel = baseRule(".chartPanel").body;
  expect(panel).toMatch(/min-width:\s*0/);
  expect(panel).toMatch(/overflow-x:\s*auto/);
});
