import "server-only";
import pg from "pg";
import { attachDatabasePool } from "@vercel/functions";

/**
 * Neon Postgres access.
 *
 * - One pooled connection pool per server instance (Neon's PgBouncer `-pooler` URL),
 *   attached to Vercel Fluid compute so idle clients are released correctly.
 * - `userDb(userId)` runs every statement inside a transaction as the restricted
 *   `authenticated` role with `app.user_id` set, so the Row Level Security
 *   policies in db/migrations enforce per-user access in the database itself.
 *   (`SET LOCAL`/`set_config(..., true)` is transaction-scoped, which is safe with
 *   PgBouncer transaction pooling.)
 * - `serviceDb()` runs as the database owner. It is used only for authentication
 *   tables and for validated writes to the shared knowledge catalog.
 */

// Return SQL types in the shapes the app expects.
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number.parseFloat(v))); // numeric
pg.types.setTypeParser(20, (v) => (v === null ? null : Number.parseInt(v, 10))); // int8 / count(*)
pg.types.setTypeParser(1082, (v) => v); // date → "YYYY-MM-DD"
pg.types.setTypeParser(1184, (v) => (v === null ? null : new Date(v).toISOString())); // timestamptz
pg.types.setTypeParser(1114, (v) => (v === null ? null : new Date(`${v}Z`).toISOString())); // timestamp

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not set. Add your Neon connection string to .env.local (see README).");
    this.name = "DatabaseNotConfiguredError";
  }
}

export function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/** Prefer explicit verify-full TLS (what node-postgres already does for sslmode=require). */
export function normalizeConnectionString(url: string): string {
  return url.replace(/sslmode=(require|prefer|verify-ca)/, "sslmode=verify-full");
}

const globalForPool = globalThis as unknown as { __lfPool?: pg.Pool };

function pool(): pg.Pool {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new DatabaseNotConfiguredError();
  if (!globalForPool.__lfPool) {
    const p = new pg.Pool({
      connectionString: normalizeConnectionString(url),
      max: Number.parseInt(process.env.DATABASE_POOL_MAX ?? "", 10) || 10,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 15_000,
    });
    p.on("error", (err) => console.error("[learnflow] idle database client error:", err.message));
    try {
      attachDatabasePool(p);
    } catch {
      // Not on Vercel: nothing to attach.
    }
    globalForPool.__lfPool = p;
  }
  return globalForPool.__lfPool;
}

export type Row = Record<string, unknown>;

export interface Db {
  readonly userId: string | null;
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
  maybeOne<T = Row>(text: string, params?: unknown[]): Promise<T | null>;
  one<T = Row>(text: string, params?: unknown[]): Promise<T>;
  count(text: string, params?: unknown[]): Promise<number>;
  /** Runs several statements in one transaction (same role and user scope). */
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}

type Exec = <T>(text: string, params?: unknown[]) => Promise<T[]>;

function build(userId: string | null, exec: Exec, runTx: <T>(fn: (db: Db) => Promise<T>) => Promise<T>): Db {
  const db: Db = {
    userId,
    query: exec,
    async maybeOne<T>(text: string, params?: unknown[]) {
      const rows = await exec<T>(text, params);
      return rows[0] ?? null;
    },
    async one<T>(text: string, params?: unknown[]) {
      const rows = await exec<T>(text, params);
      if (!rows[0]) throw new Error("Expected a row but the query returned none");
      return rows[0];
    },
    async count(text: string, params?: unknown[]) {
      const rows = await exec<{ count: number }>(text, params);
      return Number(rows[0]?.count ?? 0);
    },
    tx: runTx,
  };
  return db;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Opening statement for a scoped transaction. The user id is a validated UUID, so it is safe to inline. */
function scopePrelude(role: "authenticated" | "anon", userId: string | null): string {
  if (userId !== null && !UUID.test(userId)) throw new Error("Invalid user id for database scope");
  return `BEGIN; SELECT set_config('role', '${role}', true), set_config('app.user_id', '${userId ?? ""}', true);`;
}

function boundTo(client: pg.PoolClient, userId: string | null): Db {
  const exec: Exec = async <T,>(text: string, params?: unknown[]) => (await client.query(text, params as unknown[])).rows as T[];
  // Nested tx() calls simply join the outer transaction.
  return build(userId, exec, (fn) => fn(boundTo(client, userId)));
}

async function inScope<T>(role: "authenticated" | "anon", userId: string | null, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query(scopePrelude(role, userId));
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Database access scoped to one signed-in user (RLS enforced by Postgres). */
export function userDb(userId: string): Db {
  return build(
    userId,
    (text, params) => inScope("authenticated", userId, async (c) => (await c.query(text, params as unknown[])).rows),
    (fn) => inScope("authenticated", userId, (c) => fn(boundTo(c, userId))),
  );
}

/** Owner access: auth tables and validated catalog writes only. Bypasses RLS. */
export function serviceDb(): Db {
  return build(
    null,
    async (text, params) => (await pool().query(text, params as unknown[])).rows,
    async (fn) => {
      const client = await pool().connect();
      try {
        await client.query("BEGIN");
        const db = build(null, async (t, p) => (await client.query(t, p as unknown[])).rows, (inner) => inner(db));
        const result = await fn(db);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
  );
}

/** Postgres error code (e.g. "23505" unique violation), if any. */
export function pgCode(err: unknown): string | undefined {
  return typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : undefined;
}
