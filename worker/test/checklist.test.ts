import { beforeAll, describe, expect, it } from "vitest";
import { asUser } from "./support/database";
import { createHarness, type Harness, type TestClient } from "./support/harness";

let h: Harness;
let alice: TestClient;
let bob: TestClient;
beforeAll(async () => {
  h = await createHarness({ APP_TIME_ZONE: "America/Sao_Paulo" });
  alice = await h.newUser();
  bob = await h.newUser();
});

describe("daily checklist", () => {
  it("persists a mission on its supplied local calendar date and lists only that day", async () => {
    h.setNow("2026-09-25T01:30:00Z"); // still Sep 24 in Sao Paulo
    const created = await alice.post("/api/checklist", { title: "  Daily mission  ", date: "2026-09-24" });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({
      id: expect.any(Number), title: "Daily mission", date: "2026-09-24", completed: false,
      createdAt: "2026-09-25T01:30:00.000Z",
    });
    expect((await alice.get("/api/checklist?date=2026-09-24")).body).toEqual([created.body]);
    expect((await alice.get("/api/checklist?date=2026-09-25")).body).toEqual([]);
    expect((await bob.get("/api/checklist?date=2026-09-24")).body).toEqual([]);
  });

  it("validates dates, titles, and completion payloads", async () => {
    for (const body of [{ title: " ", date: "2026-09-24" }, { title: "A", date: "2026-02-30" }, { title: "A" }]) {
      expect((await alice.post("/api/checklist", body)).status).toBe(400);
    }
    expect((await alice.get("/api/checklist")).status).toBe(400);
    expect((await alice.get("/api/checklist?date=2026-02-30")).status).toBe(400);
    expect((await alice.patch("/api/checklist/1", { completed: "true" })).status).toBe(400);
    expect((await alice.patch("/api/checklist/1", {})).status).toBe(400);
  });

  it("allows only owner to complete, reopen and delete a mission", async () => {
    const created = await alice.post("/api/checklist", { title: "Owned", date: "2026-09-26" });
    expect(created.status).toBe(201);
    const url = `/api/checklist/${created.body.id}`;
    expect((await bob.patch(url, { completed: true })).status).toBe(404);
    expect((await bob.delete(url)).status).toBe(404);
    expect((await alice.patch(url, { completed: true })).body).toEqual({ ...created.body, completed: true });
    expect((await alice.patch(url, { completed: false })).body.completed).toBe(false);
    expect((await alice.delete(url)).status).toBe(204);
    expect((await alice.get("/api/checklist?date=2026-09-26")).body).toEqual([]);
    expect((await alice.delete(url)).status).toBe(404);
  });

  it("returns daily totals including empty days and excludes other users and legacy tasks", async () => {
    const one = await alice.post("/api/checklist", { title: "A", date: "2026-09-27" });
    await alice.post("/api/checklist", { title: "B", date: "2026-09-27" });
    await alice.patch(`/api/checklist/${one.body.id}`, { completed: true });
    await bob.post("/api/checklist", { title: "other", date: "2026-09-27" });
    await alice.post("/api/tasks", { title: "legacy" });
    const result = await alice.get("/api/analytics/checklist/daily?from=2026-09-26&to=2026-09-28");
    expect(result.status).toBe(200);
    expect(result.body).toEqual([
      { date: "2026-09-26", total: 0, completed: 0 },
      { date: "2026-09-27", total: 2, completed: 1 },
      { date: "2026-09-28", total: 0, completed: 0 },
    ]);
  });

  it("validates range and accepts 366 days inclusively", async () => {
    const path = "/api/analytics/checklist/daily";
    expect((await alice.get(`${path}?from=2026-01-01`)).status).toBe(400);
    expect((await alice.get(`${path}?from=2026-02-30&to=2026-03-01`)).status).toBe(400);
    expect((await alice.get(`${path}?from=2026-01-02&to=2026-01-01`)).body.code).toBe("ANALYTICS_INVALID_RANGE");
    expect((await alice.get(`${path}?from=2026-01-01&to=2027-01-02`)).body.code).toBe("ANALYTICS_RANGE_TOO_LARGE");
    const res = await alice.get(`${path}?from=2024-01-01&to=2024-12-31`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(366);
  });

  it("restricts direct table access and anonymous RPC execution", async () => {
    await expect(asUser(h.db, alice.userId, (tx) => tx.query("select * from public.daily_checklist"))).rejects.toThrow(/permission denied/);
    await expect(asUser(h.db, null, (tx) => tx.query("select public.api_checklist_list('2026-09-24')"))).rejects.toThrow(/permission denied/);
    await expect(asUser(h.db, null, (tx) => tx.query("select public.api_checklist_list('2026-09-24')"), { role: "authenticated" })).rejects.toThrow(/UNAUTHENTICATED/);
    expect((await h.request("/api/checklist?date=2026-09-24")).status).toBe(401);
  });
});
