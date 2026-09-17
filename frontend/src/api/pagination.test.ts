import { describe, expect, it, vi } from "vitest";
import type { Page } from "./types";
import { fetchAllContent } from "./pagination";

function page<T>(content: T[], number: number, totalPages: number): Page<T> {
  return {
    content,
    totalElements: content.length,
    totalPages,
    size: 100,
    number,
    numberOfElements: content.length,
    first: number === 0,
    last: number >= totalPages - 1,
    empty: content.length === 0,
  };
}

describe("fetchAllContent", () => {
  it("loads every backend page", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page([1, 2], 0, 2))
      .mockResolvedValueOnce(page([3], 1, 2));

    await expect(fetchAllContent(fetchPage)).resolves.toEqual([1, 2, 3]);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0, 100);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 1, 100);
  });

  it("stops when the backend returns an empty page", async () => {
    const fetchPage = vi.fn().mockResolvedValue(page([], 0, 2));

    await expect(fetchAllContent(fetchPage)).resolves.toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
