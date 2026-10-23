import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

const root = path.resolve(import.meta.dirname, "..");
const publicFile = (p: string) => path.join(root, "public", p.replace(/^\//, ""));

describe("web app manifest", () => {
  const m = manifest();

  it("has the fields browsers require for installation", () => {
    expect(m.name).toBe("LearnFlow AI");
    expect(m.short_name).toBe("LearnFlow");
    expect(m.display).toBe("standalone");
    expect(m.start_url).toMatch(/^\//);
    expect(m.scope).toBe("/");
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("ships 192 and 512 icons plus a maskable icon, with matching real dimensions", async () => {
    const icons = m.icons ?? [];
    expect(icons.some((i) => i.sizes === "192x192" && i.purpose === "any")).toBe(true);
    expect(icons.some((i) => i.sizes === "512x512" && i.purpose === "any")).toBe(true);
    expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
    for (const icon of icons) {
      const file = publicFile(icon.src);
      expect(existsSync(file), icon.src).toBe(true);
      const meta = await sharp(file).metadata();
      expect(`${meta.width}x${meta.height}`).toBe(icon.sizes);
      expect(meta.format).toBe("png");
    }
  });

  it("has an Apple touch icon", async () => {
    const meta = await sharp(publicFile("apple-touch-icon.png")).metadata();
    expect(meta.width).toBe(180);
  });
});

describe("service worker", () => {
  const sw = readFileSync(publicFile("sw.js"), "utf8");

  it("precaches only files that exist", () => {
    const list = /PRECACHE_URLS = \[([\s\S]*?)\]/.exec(sw)?.[1] ?? "";
    const urls = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter((u) => u !== "/manifest.webmanifest");
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(existsSync(publicFile(u)), u).toBe(true);
    expect(sw).toContain("OFFLINE_URL");
  });

  it("never caches API, auth or cross-origin responses", () => {
    expect(sw).toMatch(/url\.pathname\.startsWith\("\/api\/"\)/);
    expect(sw).toMatch(/url\.origin !== self\.location\.origin/);
    expect(sw).toContain('request.method !== "GET"');
  });

  it("serves an offline page that renders stored content without innerHTML", () => {
    const html = readFileSync(publicFile("offline.html"), "utf8");
    expect(html).toContain("lf-saved-lessons");
    expect(html).not.toMatch(/innerHTML\s*=/);
  });
});

describe("database security (static audit of the migration)", () => {
  const migrationsDir = path.join(root, "db", "migrations");
  const sql = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort().map((f) => readFileSync(path.join(migrationsDir, f), "utf8")).join(String.fromCharCode(10));
  const tables = [...sql.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]);

  it("enables Row Level Security on every table", () => {
    expect(tables.length).toBeGreaterThan(15);
    // Tables covered by the owner-policy loop: the array literal immediately before "enable row level security".
    const loop = /foreach t in array array\[([^\]]*)\] loop\s*execute format\('alter table public\.%I enable row level security'/.exec(sql);
    expect(loop, "RLS loop present").not.toBeNull();
    const looped = new Set([...loop![1].matchAll(/'(\w+)'/g)].map((m) => m[1]));
    for (const t of tables) {
      const direct = new RegExp(`alter table public\\.${t} enable row level security`).test(sql);
      expect(direct || looped.has(t), `RLS for ${t}`).toBe(true);
    }
  });

  it("scopes policies to the authenticated user", () => {
    expect(sql).toContain("(select auth.uid()) = user_id");
    expect(sql).toContain("(select auth.uid()) = id");
    // Open policies are allowed only as READ access to shared catalog tables.
    const openPolicies = [...sql.matchAll(/create policy "[^"]+" on public\.(\w+) for (\w+)[^;]*using\s*\(\s*true\s*\)/gi)].map((m) => ({ table: m[1], cmd: m[2].toLowerCase() }));
    expect(openPolicies.length).toBeGreaterThan(0);
    for (const p of openPolicies) {
      expect(p.table, "open policy on a non-catalog table").toMatch(/^knowledge_/);
      expect(p.cmd).toBe("select");
    }
    // Catalog tables never get write policies: writes go through the server's service role.
    expect(sql).not.toMatch(/create policy "[^"]+" on public\.knowledge_\w+ for (insert|update|delete|all)/i);
  });

  it("does not let anonymous users call privileged functions", () => {
    expect(sql).toMatch(/revoke all on function public\.delete_my_account\(\) from public, anon/);
    expect(sql).toMatch(/revoke all on function public\.record_learning_event[^;]*from public, anon/);
  });

  it("TEST 3 — no browser code references server secrets or server-only modules", () => {
    // Every client component, plus every lib module a client component imports.
    const all: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name)) all.push(p);
      }
    };
    walk(path.join(root, "src"));
    const clientFiles = all.filter((f) => /^\s*["']use client["']/.test(readFileSync(f, "utf8")));
    expect(clientFiles.length).toBeGreaterThan(10);
    const imported = new Set<string>();
    for (const f of clientFiles) {
      for (const m of readFileSync(f, "utf8").matchAll(/from "@\/(lib\/[^"]+)"/g)) {
        for (const ext of [".ts", ".tsx", "/index.ts"]) {
          const p = path.join(root, "src", m[1] + ext);
          if (existsSync(p)) imported.add(p);
        }
      }
    }
    for (const f of [...clientFiles, ...imported]) {
      const src = readFileSync(f, "utf8");
      const rel = path.relative(root, f);
      expect(src, rel).not.toMatch(/GEMINI_API_KEY|DATABASE_URL|SERVICE_ROLE|process\.env\.(?!NEXT_PUBLIC_|NODE_ENV)/);
      expect(src, rel).not.toMatch(/from "@\/lib\/(db|ai\/client|auth\/session|auth\/password)"/);
      expect(src, rel).not.toMatch(/@google\/genai|from "pg"/);
    }
  }, 60_000);
});
