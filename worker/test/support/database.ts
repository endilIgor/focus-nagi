import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite, type Transaction } from "@electric-sql/pglite";

const here = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = join(here, "../../../supabase/migrations");

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

/** Boots an in-process PostgreSQL (PGlite) with the Supabase shim and every migration applied. */
export async function createTestDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(readFileSync(join(here, "supabase-shim.sql"), "utf8"));
  for (const file of migrationFiles()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  return db;
}

export async function createAuthUser(db: PGlite, id: string, email: string): Promise<void> {
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
}

/** Runs `work` as the `authenticated` role with the given user's JWT claims, like PostgREST does. */
export async function asUser<T>(
  db: PGlite,
  userId: string | null,
  work: (tx: Transaction) => Promise<T>,
  options: { now?: string | null; role?: "authenticated" | "anon" } = {},
): Promise<T> {
  return db.transaction(async (tx) => {
    const claims = userId ? { sub: userId, role: options.role ?? "authenticated" } : { role: "anon" };
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    if (options.now) {
      await tx.query("select set_config('app.now', $1, true)", [options.now]);
    }
    await tx.exec(`set local role ${options.role ?? (userId ? "authenticated" : "anon")}`);
    return work(tx);
  });
}
