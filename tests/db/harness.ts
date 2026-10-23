import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

/**
 * Real Postgres (PGlite/WASM) with the exact migrations the app runs on Neon,
 * including the auth schema, roles and auth.uid(). RLS policies and SQL functions
 * are therefore tested for real, the same way production scopes queries.
 */

export const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "..", "..", "db", "migrations");

export async function createTestDb() {
  const db = new PGlite({ extensions: { pg_trgm, pgcrypto } });
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await db.exec(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
    } catch (e) {
      throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
    }
  }
  return db;
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

export async function createUser(db: TestDb, id: string, email = `${id.slice(0, 8)}@example.com`) {
  await db.query("insert into auth.users (id, email, password_hash) values ($1, $2, 'scrypt$test')", [id, email]);
  return id;
}

/** Runs queries exactly like userDb(): role `authenticated` (or `anon`) with app.user_id set. */
export async function asUser<T>(db: TestDb, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${userId ? "authenticated" : "anon"}`);
  await db.query("select set_config('app.user_id', $1, false)", [userId ?? ""]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('app.user_id', '', false)");
  }
}

/** Runs queries like serviceDb(): as the database owner. */
export async function asService<T>(_db: TestDb, fn: () => Promise<T>): Promise<T> {
  return fn();
}
