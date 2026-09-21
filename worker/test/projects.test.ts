import { beforeAll, describe, expect, it } from "vitest";
import { createHarness, type Harness, type TestClient } from "./support/harness";

let h: Harness;
let user: TestClient;
beforeAll(async () => {
  h = await createHarness();
});

async function createProject(client: TestClient, body: Record<string, unknown> = {}) {
  const res = await client.post("/api/projects", { title: "Project", ...body });
  expect(res.status).toBe(201);
  return res.body;
}

describe("projects", () => {
  beforeAll(async () => {
    user = await h.newUser();
  });

  it("creates a project with the full response shape", async () => {
    const res = await user.post("/api/projects", {
      title: "  Launch  ",
      description: "desc",
      startDate: "2026-01-01",
      dueDate: "2026-02-01",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: "Launch",
      description: "desc",
      status: "ACTIVE",
      startDate: "2026-01-01",
      dueDate: "2026-02-01",
      archivedAt: null,
    });
    expect(typeof res.body.id).toBe("number");
    expect(res.body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(res.body.updatedAt).toBe(res.body.createdAt);
  });

  it("validates required fields and lengths", async () => {
    const missing = await user.post("/api/projects", { description: "x" });
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe("VALIDATION_ERROR");
    expect(missing.body.message).toContain("title is required");

    const blank = await user.post("/api/projects", { title: "   " });
    expect(blank.body.message).toContain("title is required");

    const long = await user.post("/api/projects", { title: "x".repeat(121) });
    expect(long.status).toBe(400);
    expect(long.body.message).toContain("title must be at most 120 characters");

    const badDate = await user.post("/api/projects", { title: "x", startDate: "2026-02-30" });
    expect(badDate.status).toBe(400);
    expect(badDate.body.code).toBe("VALIDATION_ERROR");
  });

  it("rejects due dates before the start date", async () => {
    const res = await user.post("/api/projects", { title: "x", startDate: "2026-02-02", dueDate: "2026-02-01" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("PROJECT_INVALID_DATES");
  });

  it("gets, and returns 404 for missing projects", async () => {
    const p = await createProject(user, { title: "Gettable" });
    const res = await user.get(`/api/projects/${p.id}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Gettable");
    const missing = await user.get("/api/projects/999999");
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ code: "PROJECT_NOT_FOUND", message: "Project not found." });
  });

  it("partially updates only provided fields and re-validates dates", async () => {
    const p = await createProject(user, { title: "Old", description: "keep", startDate: "2026-01-10" });
    const res = await user.patch(`/api/projects/${p.id}`, { title: " New " });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: "New", description: "keep", startDate: "2026-01-10" });

    const invalid = await user.patch(`/api/projects/${p.id}`, { dueDate: "2026-01-01" });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe("PROJECT_INVALID_DATES");

    const blank = await user.patch(`/api/projects/${p.id}`, { title: "  " });
    expect(blank.status).toBe(400);
    expect(blank.body.code).toBe("VALIDATION_ERROR");
  });

  it("enforces the complete/archive/restore state machine", async () => {
    const p = await createProject(user);
    const completed = await user.post(`/api/projects/${p.id}/complete`);
    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe("COMPLETED");

    const again = await user.post(`/api/projects/${p.id}/complete`);
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({
      code: "INVALID_PROJECT_STATE",
      message: "Only an active project can be completed.",
    });

    const archived = await user.post(`/api/projects/${p.id}/archive`);
    expect(archived.body.status).toBe("ARCHIVED");
    expect(archived.body.archivedAt).not.toBeNull();

    const archivedAgain = await user.post(`/api/projects/${p.id}/archive`);
    expect(archivedAgain.status).toBe(409);
    expect(archivedAgain.body.message).toBe("Project is already archived.");

    const restored = await user.post(`/api/projects/${p.id}/restore`);
    expect(restored.body).toMatchObject({ status: "ACTIVE", archivedAt: null });

    const restoreActive = await user.post(`/api/projects/${p.id}/restore`);
    expect(restoreActive.status).toBe(409);
    expect(restoreActive.body.message).toBe("Only an archived project can be restored.");
  });

  it("lists newest first with Spring-style pagination and status filter", async () => {
    const client = await h.newUser();
    for (const title of ["A", "B", "C"]) await createProject(client, { title });
    const archived = await createProject(client, { title: "D" });
    await client.post(`/api/projects/${archived.id}/archive`);

    const page = await client.get("/api/projects?page=0&size=2");
    expect(page.status).toBe(200);
    expect(page.body).toMatchObject({
      totalElements: 4,
      totalPages: 2,
      size: 2,
      number: 0,
      numberOfElements: 2,
      first: true,
      last: false,
      empty: false,
    });
    expect(page.body.content.map((p: { title: string }) => p.title)).toEqual(["D", "C"]);

    const active = await client.get("/api/projects?status=ACTIVE&size=500");
    expect(active.body.size).toBe(100);
    expect(active.body.content.map((p: { title: string }) => p.title)).toEqual(["C", "B", "A"]);

    const beyond = await client.get("/api/projects?page=5");
    expect(beyond.body).toMatchObject({ empty: true, last: true, numberOfElements: 0 });

    const badStatus = await client.get("/api/projects?status=NOPE");
    expect(badStatus.status).toBe(400);
    expect(badStatus.body.code).toBe("MALFORMED_REQUEST");

    const badPage = await client.get("/api/projects?page=abc");
    expect(badPage.body.code).toBe("MALFORMED_REQUEST");
  });

  it("reports total focus seconds of completed sessions", async () => {
    const p = await createProject(user);
    const res = await user.get(`/api/projects/${p.id}/focus`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ projectId: p.id, totalFocusSeconds: 0 });
    expect((await user.get("/api/projects/999999/focus")).status).toBe(404);
  });
});

describe("project isolation between users", () => {
  it("never exposes or mutates another user's projects", async () => {
    const alice = await h.newUser();
    const bob = await h.newUser();
    const secret = await createProject(alice, { title: "Alice only" });

    expect((await bob.get(`/api/projects/${secret.id}`)).status).toBe(404);
    expect((await bob.patch(`/api/projects/${secret.id}`, { title: "pwned" })).status).toBe(404);
    expect((await bob.post(`/api/projects/${secret.id}/archive`)).status).toBe(404);
    expect((await bob.get("/api/projects")).body.totalElements).toBe(0);

    const stillAlice = await alice.get(`/api/projects/${secret.id}`);
    expect(stillAlice.body).toMatchObject({ title: "Alice only", status: "ACTIVE" });
  });
});
