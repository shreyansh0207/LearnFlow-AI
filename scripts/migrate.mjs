// Applies db/migrations/*.sql to Neon in filename order, once each.
// Usage: npm run db:migrate   (reads DATABASE_URL_UNPOOLED or DATABASE_URL from .env.local)
//
// Migrations run over the DIRECT (non-pooler) connection, as Neon recommends for
// schema changes. Each file runs in its own transaction and is recorded in
// meta.schema_migrations so re-running is safe.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const pooled = process.env.DATABASE_URL?.trim();
const direct = process.env.DATABASE_URL_UNPOOLED?.trim() || pooled?.replace("-pooler.", ".");
if (!direct) {
  console.error("DATABASE_URL is not set. Add your Neon connection string to .env.local.");
  process.exit(1);
}

const dir = path.resolve(import.meta.dirname, "..", "db", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const client = new pg.Client({ connectionString: direct.replace(/sslmode=(require|prefer|verify-ca)/, "sslmode=verify-full") });

await client.connect();
try {
  await client.query("create schema if not exists meta; create table if not exists meta.schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  const applied = new Set((await client.query("select name from meta.schema_migrations")).rows.map((r) => r.name));
  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(dir, file), "utf8");
    process.stdout.write(`Applying ${file} … `);
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("insert into meta.schema_migrations (name) values ($1)", [file]);
      await client.query("COMMIT");
      console.log("done");
      ran++;
    } catch (e) {
      await client.query("ROLLBACK");
      console.log("FAILED");
      console.error(e.message);
      process.exit(1);
    }
  }
  console.log(ran ? `Applied ${ran} migration(s).` : "Database is up to date.");
} finally {
  await client.end();
}
