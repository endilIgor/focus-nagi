import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createHarness, type Harness, type TestClient } from "./support/harness";

let h: Harness;
let user: TestClient;
beforeAll(async () => {
  h = await createHarness();
  user = await h.newUser();
});
afterEach(() => h.setNow(null));

describe("journal", () => {
  it("creates entries, trimming content, and rejects future dates", async () => {
    h.setNow("2026-07-10T12:00:00Z");
    const created = await user.post("/api/journal", { entryDate: "2026-07-10", content: "  today  " });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ entryDate: "2026-07-10", content: "today" });

    const future = await user.post("/api/journal", { entryDate: "2026-07-11", content: "tomorrow" });
    expect(future.status).toBe(400);
    expect(future.body.code).toBe("JOURNAL_FUTURE_DATE");

    const invalid = await user.post("/api/journal", { content: " " });
    expect(invalid.body.message).toContain("entryDate is required");
    expect(invalid.body.message).toContain("content is required");
  });

  it("judges 'future' in APP_TIME_ZONE", async () => {
    const zoned = await createHarness({ APP_TIME_ZONE: "Asia/Tokyo" });
    const u = await zoned.newUser();
    zoned.setNow("2026-07-10T16:00:00Z"); // already July 11 in Tokyo
    expect((await u.post("/api/journal", { entryDate: "2026-07-11", content: "x" })).status).toBe(201);
  });

  it("lists by date, by range and recent entries in the original orders", async () => {
    const client = await h.newUser();
    h.setNow("2026-07-10T08:00:00Z");
    const d1a = (await client.post("/api/journal", { entryDate: "2026-07-01", content: "1a" })).body;
    h.setNow("2026-07-10T09:00:00Z");
    const d1b = (await client.post("/api/journal", { entryDate: "2026-07-01", content: "1b" })).body;
    const d2 = (await client.post("/api/journal", { entryDate: "2026-07-02", content: "2" })).body;
    const d5 = (await client.post("/api/journal", { entryDate: "2026-07-05", content: "5" })).body;

    const byDate = await client.get("/api/journal?date=2026-07-01");
    expect(byDate.status).toBe(200);
    expect(byDate.body.map((e: { id: number }) => e.id)).toEqual([d1a.id, d1b.id]);

    const range = await client.get("/api/journal/range?from=2026-07-01&to=2026-07-02");
    expect(range.body.content.map((e: { id: number }) => e.id)).toEqual([d1a.id, d1b.id, d2.id]);
    expect(range.body.size).toBe(20);

    const recent = await client.get("/api/journal/recent?size=2");
    expect(recent.body.content.map((e: { id: number }) => e.id)).toEqual([d5.id, d2.id]);
    expect(recent.body.totalElements).toBe(4);

    const badRange = await client.get("/api/journal/range?from=2026-07-02&to=2026-07-01");
    expect(badRange.status).toBe(400);
    expect(badRange.body.code).toBe("JOURNAL_INVALID_RANGE");
    const missing = await client.get("/api/journal/range?from=2026-07-02");
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe("VALIDATION_ERROR");
    expect((await client.get("/api/journal")).body.code).toBe("VALIDATION_ERROR");
  });

  it("updates and deletes entries", async () => {
    h.setNow("2026-07-10T12:00:00Z");
    const e = (await user.post("/api/journal", { entryDate: "2026-07-09", content: "draft" })).body;
    const moved = await user.patch(`/api/journal/${e.id}`, { entryDate: "2026-07-08" });
    expect(moved.body).toMatchObject({ entryDate: "2026-07-08", content: "draft" });
    const edited = await user.patch(`/api/journal/${e.id}`, { content: "final" });
    expect(edited.body).toMatchObject({ entryDate: "2026-07-08", content: "final" });
    expect((await user.patch(`/api/journal/${e.id}`, { entryDate: "2026-08-01" })).body.code).toBe(
      "JOURNAL_FUTURE_DATE",
    );
    expect((await user.delete(`/api/journal/${e.id}`)).status).toBe(204);
    expect((await user.patch(`/api/journal/${e.id}`, { content: "x" })).body.code).toBe("JOURNAL_ENTRY_NOT_FOUND");
  });

  it("isolates journal entries per user", async () => {
    const other = await h.newUser();
    h.setNow("2026-07-10T12:00:00Z");
    const e = (await user.post("/api/journal", { entryDate: "2026-07-03", content: "mine" })).body;
    expect((await other.get("/api/journal?date=2026-07-03")).body).toEqual([]);
    expect((await other.delete(`/api/journal/${e.id}`)).status).toBe(404);
    expect((await other.get("/api/journal/recent")).body.totalElements).toBe(0);
  });
});
