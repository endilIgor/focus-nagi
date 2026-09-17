import type { Page } from "./types";

const PAGE_SIZE = 100;

export async function fetchAllContent<T>(
  fetchPage: (page: number, size: number) => Promise<Page<T>>,
): Promise<T[]> {
  const content: T[] = [];
  let pageNumber = 0;

  while (true) {
    const page = await fetchPage(pageNumber, PAGE_SIZE);
    content.push(...page.content);

    if (page.last || page.content.length === 0) return content;
    pageNumber += 1;
  }
}
