import { createElement, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FocusSessionResponse, Page } from "../api/types";

vi.mock("../api/focusSessions", () => ({
  focusSessionsApi: { list: vi.fn() },
}));

import { focusSessionsApi } from "../api/focusSessions";
import {
  applyFinishedFocusSession,
  computeElapsedSeconds,
  computeIdleSeconds,
  CURRENT_FOCUS_SESSION_KEY,
  formatDuration,
  LAST_COMPLETED_FOCUS_SESSION_KEY,
  useLastCompletedFocusSession,
} from "./useFocusSession";

const mockedList = vi.mocked(focusSessionsApi.list);

function session(overrides: Partial<FocusSessionResponse>): FocusSessionResponse {
  return {
    id: 1,
    taskId: null,
    projectId: null,
    startedAt: "2026-09-17T10:00:00Z",
    endedAt: null,
    plannedFocusMinutes: 50,
    plannedBreakMinutes: null,
    pausedSecondsAccum: 0,
    lastPausedAt: null,
    actualFocusSeconds: null,
    status: "RUNNING",
    notes: null,
    createdAt: "2026-09-17T10:00:00Z",
    ...overrides,
  };
}

describe("computeElapsedSeconds", () => {
  it("counts elapsed time for a running session minus prior pauses", () => {
    const nowMs = Date.parse("2026-09-17T10:10:00Z");
    const s = session({ pausedSecondsAccum: 60 });
    // 600s elapsed - 60s paused = 540s
    expect(computeElapsedSeconds(s, nowMs)).toBe(540);
  });

  it("freezes elapsed time while paused, regardless of how long real time passes", () => {
    const s = session({
      status: "PAUSED",
      pausedSecondsAccum: 30,
      lastPausedAt: "2026-09-17T10:05:00Z", // paused 5 min (300s) after start
    });
    const elapsedAtPauseMoment = computeElapsedSeconds(s, Date.parse("2026-09-17T10:05:00Z"));
    const elapsedTenMinutesLater = computeElapsedSeconds(s, Date.parse("2026-09-17T10:15:00Z"));
    // 300s since start - 30s prior pauses = 270s, unaffected by how long the current pause lasts
    expect(elapsedAtPauseMoment).toBe(270);
    expect(elapsedTenMinutesLater).toBe(270);
  });

  it("never returns a negative value", () => {
    const s = session({ pausedSecondsAccum: 10_000 });
    expect(computeElapsedSeconds(s, Date.parse("2026-09-17T10:00:01Z"))).toBe(0);
  });
});

describe("computeIdleSeconds", () => {
  const nowMs = Date.parse("2026-09-17T12:00:00Z");

  it("counts seconds since endedAt of the last COMPLETED session", () => {
    const s = session({ status: "COMPLETED", endedAt: "2026-09-17T11:59:15Z" });
    expect(computeIdleSeconds(s, nowMs)).toBe(45);
  });

  it("returns 0 without history or without endedAt", () => {
    expect(computeIdleSeconds(null, nowMs)).toBe(0);
    expect(computeIdleSeconds(undefined, nowMs)).toBe(0);
    expect(computeIdleSeconds(session({ status: "COMPLETED", endedAt: null }), nowMs)).toBe(0);
  });

  it("returns 0 for invalid or future timestamps, never NaN or negative", () => {
    expect(computeIdleSeconds(session({ status: "COMPLETED", endedAt: "não-é-data" }), nowMs)).toBe(0);
    expect(computeIdleSeconds(session({ status: "COMPLETED", endedAt: "2026-09-17T12:05:00Z" }), nowMs)).toBe(0);
    expect(computeIdleSeconds(session({ status: "COMPLETED", endedAt: "2026-09-17T11:00:00Z" }), Number.NaN)).toBe(0);
  });

  it("keeps counting past one hour and across midnight", () => {
    const s = session({ status: "COMPLETED", endedAt: "2026-09-16T22:58:55Z" });
    // 13h01m05s later, crossing midnight
    expect(computeIdleSeconds(s, nowMs)).toBe(13 * 3600 + 65);
  });
});

describe("formatDuration", () => {
  it("uses mm:ss below one hour", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(65)).toBe("01:05");
    expect(formatDuration(3599)).toBe("59:59");
  });

  it("uses hh:mm:ss from one hour on, without wrapping at 24h", () => {
    expect(formatDuration(3600)).toBe("01:00:00");
    expect(formatDuration(3725)).toBe("01:02:05");
    expect(formatDuration(25 * 3600 + 1)).toBe("25:00:01");
  });

  it("clamps invalid input to 00:00", () => {
    expect(formatDuration(-5)).toBe("00:00");
    expect(formatDuration(Number.NaN)).toBe("00:00");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("00:00");
  });
});

function page(content: FocusSessionResponse[]): Page<FocusSessionResponse> {
  return {
    content,
    totalElements: content.length,
    totalPages: 1,
    size: 1,
    number: 0,
    numberOfElements: content.length,
    first: true,
    last: true,
    empty: content.length === 0,
  };
}

function wrapperFor(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useLastCompletedFocusSession", () => {
  beforeEach(() => vi.resetAllMocks());

  it("queries only the most recent COMPLETED session from the server", async () => {
    const completed = session({ id: 9, status: "COMPLETED", endedAt: "2026-09-17T10:50:00Z" });
    mockedList.mockResolvedValue(page([completed]));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useLastCompletedFocusSession(), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => expect(result.current.data).toEqual(completed));
    expect(mockedList).toHaveBeenCalledWith({ status: "COMPLETED", page: 0, size: 1 });
    expect(queryClient.getQueryData(LAST_COMPLETED_FOCUS_SESSION_KEY)).toEqual(completed);
  });

  it("resolves to null when there is no completed history", async () => {
    mockedList.mockResolvedValue(page([]));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useLastCompletedFocusSession(), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe("useLastCompletedFocusSession remote sync (QA)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => vi.useRealTimers());

  it("picks up a session started and completed on another device entirely between polls", async () => {
    mockedList.mockResolvedValue(page([]));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useLastCompletedFocusSession(), { wrapper: wrapperFor(queryClient) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();

    // Never seen as RUNNING by this client: it began and ended between two polls.
    const remote = session({ id: 21, status: "COMPLETED", startedAt: "2026-09-17T11:00:00Z", endedAt: "2026-09-17T11:25:00Z" });
    mockedList.mockResolvedValue(page([remote]));
    await act(() => vi.advanceTimersByTimeAsync(20_000));

    await waitFor(() => expect(result.current.data).toEqual(remote));
    expect(mockedList).toHaveBeenLastCalledWith({ status: "COMPLETED", page: 0, size: 1 });
  });

  it("moves an idle base forward when another device completes a newer session", async () => {
    const old = session({ id: 3, status: "COMPLETED", endedAt: "2026-09-17T08:00:00Z" });
    const newer = session({ id: 4, status: "COMPLETED", endedAt: "2026-09-17T10:50:00Z" });
    mockedList.mockResolvedValue(page([old]));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useLastCompletedFocusSession(), { wrapper: wrapperFor(queryClient) });
    await waitFor(() => expect(result.current.data).toEqual(old));

    mockedList.mockResolvedValue(page([newer]));
    await act(() => vi.advanceTimersByTimeAsync(20_000));

    await waitFor(() => expect(result.current.data).toEqual(newer));
  });
});

describe("applyFinishedFocusSession", () => {
  beforeEach(() => vi.resetAllMocks());

  it("writes the finish response and a late in-flight history read cannot overwrite it", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const old = session({ id: 3, status: "COMPLETED", endedAt: "2026-09-17T08:00:00Z" });
    const finished = session({ id: 4, status: "COMPLETED", endedAt: "2026-09-17T10:50:00Z" });
    queryClient.setQueryData(CURRENT_FOCUS_SESSION_KEY, session({ id: 4 }));
    let resolveRead!: (value: FocusSessionResponse | null) => void;
    const inFlight = queryClient.prefetchQuery({
      queryKey: LAST_COMPLETED_FOCUS_SESSION_KEY,
      queryFn: () => new Promise<FocusSessionResponse | null>((resolve) => (resolveRead = resolve)),
    });

    await applyFinishedFocusSession(queryClient, finished);

    expect(queryClient.getQueryData(LAST_COMPLETED_FOCUS_SESSION_KEY)).toEqual(finished);
    expect(queryClient.getQueryData(CURRENT_FOCUS_SESSION_KEY)).toBeNull();
    resolveRead(old);
    await inFlight;
    expect(queryClient.getQueryData(LAST_COMPLETED_FOCUS_SESSION_KEY)).toEqual(finished);
  });

  it("does not move the idle base for a non-COMPLETED response", async () => {
    const queryClient = new QueryClient();
    const old = session({ id: 3, status: "COMPLETED", endedAt: "2026-09-17T08:00:00Z" });
    queryClient.setQueryData(LAST_COMPLETED_FOCUS_SESSION_KEY, old);

    await applyFinishedFocusSession(
      queryClient,
      session({ id: 4, status: "CANCELLED", endedAt: "2026-09-17T10:50:00Z" }),
    );

    expect(queryClient.getQueryData(LAST_COMPLETED_FOCUS_SESSION_KEY)).toEqual(old);
    expect(queryClient.getQueryData(CURRENT_FOCUS_SESSION_KEY)).toBeNull();
  });
});
