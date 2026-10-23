// Verifies the Neon schema and the RLS role scoping end to end (no secrets printed).
import pg from "pg";
const c = new pg.Client({ connectionString: (process.env.DATABASE_URL ?? "").replace(/sslmode=require/, "sslmode=verify-full") });
await c.connect();
const q = async (s, p) => (await c.query(s, p)).rows;
console.log("tables:", (await q("select count(*)::int n from information_schema.tables where table_schema in ('public','auth')"))[0].n,
  "| RLS-enabled public tables:", (await q("select count(*)::int n from pg_tables where schemaname='public' and rowsecurity"))[0].n,
  "| of", (await q("select count(*)::int n from pg_tables where schemaname='public'"))[0].n);
console.log("catalog nodes:", (await q("select count(*)::int n from public.knowledge_nodes"))[0].n);
// Scoped as an authenticated user with no data: can read catalog, cannot write it, sees no private rows.
await c.query("BEGIN; SELECT set_config('role','authenticated',true), set_config('app.user_id','00000000-0000-4000-8000-000000000001',true);");
console.log("as authenticated → catalog readable:", (await q("select count(*)::int n from public.knowledge_nodes"))[0].n > 0,
  "| journeys visible:", (await q("select count(*)::int n from public.learning_journeys"))[0].n);
try { await c.query("insert into public.knowledge_nodes (path,name,name_key,kind,origin) values ('x','x','x','domain','curated')"); console.log("catalog write: ALLOWED (bad)"); }
catch (e) { console.log("catalog write blocked:", e.message); }
await c.query("ROLLBACK");
console.log("search 'budgeting' →", (await q("select name from public.search_knowledge('budgeting','budgeting',3)")).map((r) => r.name).join(", "));
await c.end();
