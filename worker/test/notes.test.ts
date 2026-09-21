import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createHarness, type Harness, type TestClient } from "./support/harness";

let h: Harness;
let user: TestClient;
beforeAll(async () => {
  h = await createHarness();
  user = await h.newUser();
});
afterEach(() => h.setNow(null));

describe("notes", () => {
  it("creates, gets, updates and deletes notes", async () => {
    const created = await user.post("/api/notes", { title: " Idea ", content: "body" });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ title: "Idea", content: "body", pinned: false, projectId: null });
    const id = created.body.id;

    expect((await user.get(`/api/notes/${id}`)).body.title).toBe("Idea");

    const project = (await user.post("/api/projects", { title: "P" })).body;
    const updated = await user.patch(`/api/notes/${id}`, { title: "Renamed", projectId: project.id });
    // content is always applied (omitted clears it), like the original API
    expect(updated.body).toMatchObject({ title: "Renamed", content: null, projectId: project.id });

    const kept = await user.patch(`/api/notes/${id}`, { content: "again" });
    expect(kept.body).toMatchObject({ title: "Renamed", content: "again", projectId: null });

    expect((await user.patch(`/api/notes/${id}`, { projectId: 999999 })).body.code).toBe("PROJECT_NOT_FOUND");
    expect((await user.delete(`/api/notes/${id}`)).status).toBe(204);
    expect((await user.get(`/api/notes/${id}`)).body.code).toBe("NOTE_NOT_FOUND");
  });

  it("validates notes", async () => {
    const res = await user.post("/api/notes", { title: "", content: "x".repeat(20001) });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("title is required");
    expect(res.body.message).toContain("content must be at most 20000 characters");
  });

  it("pins without touching updatedAt and lists pinned first, then most recently updated", async () => {
    const client = await h.newUser();
    h.setNow("2026-06-01T10:00:00Z");
    const a = (await client.post("/api/notes", { title: "alpha", content: "Hello World" })).body;
    h.setNow("2026-06-01T11:00:00Z");
    const b = (await client.post("/api/notes", { title: "beta", content: "100% sure_thing" })).body;
    h.setNow("2026-06-01T12:00:00Z");
    const c = (await client.post("/api/notes", { title: "gamma" })).body;

    h.setNow("2026-06-02T12:00:00Z");
    const pinned = await client.post(`/api/notes/${a.id}/pin`);
    expect(pinned.body).toMatchObject({ pinned: true, updatedAt: a.updatedAt });

    const list = await client.get("/api/notes");
    expect(list.body.content.map((n: { id: number }) => n.id)).toEqual([a.id, c.id, b.id]);

    expect((await client.get("/api/notes?pinned=true")).body.content.map((n: { id: number }) => n.id)).toEqual([
      a.id,
    ]);
    expect((await client.get("/api/notes?pinned=false")).body.totalElements).toBe(2);

    const search = await client.get(`/api/notes?q=${encodeURIComponent("WORLD")}`);
    expect(search.body.content.map((n: { id: number }) => n.id)).toEqual([a.id]);
    const literal = await client.get(`/api/notes?q=${encodeURIComponent("0% s")}`);
    expect(literal.body.content.map((n: { id: number }) => n.id)).toEqual([b.id]);
    const wildcard = await client.get(`/api/notes?q=${encodeURIComponent("%")}`);
    expect(wildcard.body.content.map((n: { id: number }) => n.id)).toEqual([b.id]);
    const underscore = await client.get(`/api/notes?q=${encodeURIComponent("_")}`);
    expect(underscore.body.content.map((n: { id: number }) => n.id)).toEqual([b.id]);
    const injection = await client.get(`/api/notes?q=${encodeURIComponent("'; drop table note; --")}`);
    expect(injection.status).toBe(200);
    expect(injection.body.totalElements).toBe(0);

    const unpinned = await client.post(`/api/notes/${a.id}/unpin`);
    expect(unpinned.body.pinned).toBe(false);
    expect((await client.get("/api/notes?pinned=maybe")).body.code).toBe("MALFORMED_REQUEST");
  });

  it("isolates notes per user", async () => {
    const other = await h.newUser();
    const mine = (await user.post("/api/notes", { title: "private", content: "secret" })).body;
    expect((await other.get(`/api/notes/${mine.id}`)).status).toBe(404);
    expect((await other.post(`/api/notes/${mine.id}/pin`)).status).toBe(404);
    expect((await other.delete(`/api/notes/${mine.id}`)).status).toBe(404);
    expect((await other.get("/api/notes?q=secret")).body.totalElements).toBe(0);
  });
});
