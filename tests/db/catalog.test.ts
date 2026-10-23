import { beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createTestDb, createUser, type TestDb } from "./harness";
import { topicKey } from "@/lib/utils";

/**
 * Integration tests against real Postgres (PGlite) with all migrations applied.
 * They exercise the actual SQL: search ranking, constraints, RLS policies and
 * functions, not mocks.
 */

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADMIN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

let db: TestDb;

type Hit = { id: string; name: string; status: string; rank: number; path: string };
const search = (q: string, userId = A) =>
  asUser(db, userId, async () => (await db.query<Hit>("select id, name, status, rank, path from public.search_knowledge($1, $2, 10)", [q, topicKey(q)])).rows);

const nodeId = async (path: string) => (await db.query<{ id: string }>("select id from public.knowledge_nodes where path = $1", [path])).rows[0]?.id;

async function serviceInsertNode(parentPath: string, name: string, extra: { aliases?: string[]; status?: string; origin?: string } = {}) {
  return asService(db, async () => {
    const aliases = extra.aliases ?? [];
    const r = await db.query<{ id: string }>(
      `insert into public.knowledge_nodes (parent_id, path, name, name_key, aliases, alias_keys, kind, origin, status)
       select id, $1, $2, $3, $4, $5, 'topic', $6, $7 from public.knowledge_nodes where path = $8 returning id`,
      [`${parentPath}/${topicKey(name)}`, name, topicKey(name), aliases, aliases.map(topicKey), extra.origin ?? "ai_generated", extra.status ?? "proposed", parentPath],
    );
    return r.rows[0].id;
  });
}

beforeAll(async () => {
  db = await createTestDb();
  for (const u of [A, B, ADMIN]) await createUser(db, u);
  await db.query("insert into public.app_admins (user_id) values ($1)", [ADMIN]);
}, 60_000);

describe("catalog search", () => {
  it("TEST A — finds a common curated topic first, with an exact-match boost", async () => {
    const hits = await search("personal finance");
    expect(hits[0]).toMatchObject({ name: "Personal finance", status: "verified" });
    expect(hits[0].rank).toBeGreaterThanOrEqual(2);
  });

  it("finds topics by alias and by misspelling", async () => {
    expect((await search("Budgeting"))[0].name).toBe("Personal finance");
    expect((await search("maths"))[0].name).toBe("Mathematics and Formal Sciences");
    expect((await search("photograpy")).map((h) => h.name)).toContain("Photography");
  });

  it("returns related topics for longer phrases without inventing an exact match", async () => {
    const hits = await search("underwater photography");
    expect(hits.map((h) => h.name)).toContain("Photography");
    expect(hits[0].rank).toBeLessThan(2);
  });

  it("paginates and caps results", async () => {
    const page = await asUser(db, A, async () => (await db.query<Hit>("select id from public.search_knowledge('science', null, 3, 0)")).rows);
    const page2 = await asUser(db, A, async () => (await db.query<Hit>("select id from public.search_knowledge('science', null, 3, 3)")).rows);
    expect(page).toHaveLength(3);
    expect(page2.map((p) => p.id)).not.toContain(page[0].id);
    const capped = await asUser(db, A, async () => (await db.query("select id from public.search_knowledge('a', null, 500)")).rows);
    expect(capped.length).toBeLessThanOrEqual(50);
  });

  it("walks ancestors for breadcrumbs", async () => {
    const id = await nodeId("computing-and-technology/cybersecurity");
    const rows = await asUser(db, A, async () => (await db.query<{ name: string }>("select name from public.knowledge_ancestors($1)", [id])).rows);
    expect(rows.map((r) => r.name)).toEqual(["Computing and Technology"]);
  });
});

describe("TEST J — runtime catalog growth without redeploying", () => {
  it("a node added at runtime is immediately searchable, inherits its domain, and starts unverified", async () => {
    const id = await serviceInsertNode("practical-and-vocational-skills/woodworking", "Japanese joinery", { aliases: ["Sashimono", "Kigumi"] });
    const hits = await search("sashimono");
    expect(hits[0]).toMatchObject({ id, name: "Japanese joinery", status: "proposed" });
    const { rows } = await db.query<{ domain: string }>("select d.name as domain from public.knowledge_nodes n join public.knowledge_nodes d on d.id = n.domain_id where n.id = $1", [id]);
    expect(rows[0].domain).toBe("Practical and Vocational Skills");
  });
});

describe("TEST G — duplicates and aliases", () => {
  it("rejects a duplicate name under the same parent but allows the same name elsewhere", async () => {
    await expect(serviceInsertNode("practical-and-vocational-skills/woodworking", "Japanese Joinery")).rejects.toThrow(/duplicate key|unique/i);
    // "Mercury" the planet vs. the element: same name, different parents.
    const p1 = await serviceInsertNode("natural-and-physical-sciences/astronomy", "Mercury");
    const p2 = await serviceInsertNode("natural-and-physical-sciences/chemistry", "Mercury");
    expect(p1).not.toBe(p2);
  });

  it("merging moves children, aliases, links and learner journeys to the target, and hides the source", async () => {
    const target = await serviceInsertNode("arts-media-and-creative-work/photography", "Underwater photography", { aliases: ["Scuba photography"] });
    const dupe = await serviceInsertNode("natural-and-physical-sciences/oceanography", "Marine photography");
    const child = await asService(db, async () =>
      (
        await db.query<{ id: string }>(
          "insert into public.knowledge_nodes (parent_id, path, name, name_key, kind, origin) values ($1, 'x/strobes', 'Strobe lighting', 'strobe-lighting', 'subtopic', 'ai_generated') returning id",
          [dupe],
        )
      ).rows[0].id,
    );
    const related = await nodeId("natural-and-physical-sciences/oceanography");
    await asService(db, () => db.query("insert into public.knowledge_edges (node_id, target_id, relation, origin) values ($1, $2, 'related', 'ai_generated')", [dupe, related]));
    const journey = await asUser(db, A, async () =>
      (await db.query<{ id: string }>("insert into public.learning_journeys (user_id, title, subject, knowledge_node_id) values ($1, 'Marine photo', 'Marine photography', $2) returning id", [A, dupe])).rows[0].id,
    );

    await asService(db, () => db.query("select public.merge_knowledge_nodes($1, $2)", [dupe, target]));

    const t = (await db.query<{ aliases: string[] }>("select aliases from public.knowledge_nodes where id = $1", [target])).rows[0];
    expect(t.aliases).toEqual(expect.arrayContaining(["Scuba photography", "Marine photography"]));
    expect((await db.query<{ parent_id: string }>("select parent_id from public.knowledge_nodes where id = $1", [child])).rows[0].parent_id).toBe(target);
    expect((await db.query("select 1 from public.knowledge_edges where node_id = $1 and target_id = $2", [target, related])).rows).toHaveLength(1);
    expect((await db.query<{ knowledge_node_id: string }>("select knowledge_node_id from public.learning_journeys where id = $1", [journey])).rows[0].knowledge_node_id).toBe(target);

    const hiddenForUsers = await asUser(db, B, async () => (await db.query("select id from public.knowledge_nodes where id = $1", [dupe])).rows);
    expect(hiddenForUsers).toHaveLength(0);
    expect((await search("marine photography")).find((h) => h.id === dupe)).toBeUndefined();
    expect((await search("marine photography"))[0].id).toBe(target);
  });

  it("refuses merges that would create a cycle", async () => {
    const parent = await serviceInsertNode("arts-media-and-creative-work/animation", "Stop motion");
    const kid = await asService(db, async () =>
      (await db.query<{ id: string }>("insert into public.knowledge_nodes (parent_id, path, name, name_key, kind, origin) values ($1, 'y/clay', 'Claymation', 'claymation', 'subtopic', 'ai_generated') returning id", [parent])).rows[0].id,
    );
    await expect(asService(db, () => db.query("select public.merge_knowledge_nodes($1, $2)", [parent, kid]))).rejects.toThrow(/descendant/);
  });
});

describe("TEST H — source metadata", () => {
  it("stores attributed source metadata and rejects non-https URLs", async () => {
    const node = await nodeId("natural-and-physical-sciences/astrophysics");
    await asService(db, () =>
      db.query("insert into public.knowledge_sources (node_id, url, title, provider, source_type, license, retrieved_at) values ($1, 'https://en.wikipedia.org/wiki/Big_Bang', 'Big Bang', 'Wikipedia', 'reference', 'CC BY-SA 4.0', now())", [node]),
    );
    await expect(
      asService(db, () => db.query("insert into public.knowledge_sources (node_id, url, title, provider, source_type, retrieved_at) values ($1, 'http://insecure.example', 'x', 'Web', 'web', now())", [node])),
    ).rejects.toThrow(/check/i);
    const rows = await asUser(db, B, async () => (await db.query<{ title: string; provider: string }>("select title, provider from public.knowledge_sources where node_id = $1", [node])).rows);
    expect(rows).toEqual([{ title: "Big Bang", provider: "Wikipedia" }]);
  });
});

describe("TEST L — access control", () => {
  it("users can read the catalog but cannot write to it", async () => {
    await asUser(db, A, async () => {
      expect((await db.query("select id from public.knowledge_nodes limit 1")).rows).toHaveLength(1);
      await expect(db.query("insert into public.knowledge_nodes (path, name, name_key, kind, origin) values ('evil', 'Evil', 'evil', 'domain', 'curated')")).rejects.toThrow(/row-level security/);
      const upd = await db.query("update public.knowledge_nodes set status = 'verified' where status = 'proposed'");
      expect(upd.affectedRows).toBe(0);
      const del = await db.query("delete from public.knowledge_nodes");
      expect(del.affectedRows).toBe(0);
      await expect(db.query("insert into public.knowledge_sources (node_id, url, title, provider, source_type, retrieved_at) select id, 'https://x.org', 'x', 'x', 'web', now() from public.knowledge_nodes limit 1")).rejects.toThrow(/row-level security/);
    });
  });

  it("only admins can read demand signals and job logs; nobody can call privileged functions through the API", async () => {
    await asService(db, () => db.query("select public.record_topic_request('kintsugi', 'Kintsugi', null)"));
    await asService(db, () => db.query("insert into public.catalog_jobs (kind, status, topic, error_code) values ('propose', 'failed', 'Kintsugi', 'timeout')"));
    expect(await asUser(db, A, async () => (await db.query("select * from public.topic_requests")).rows)).toHaveLength(0);
    expect(await asUser(db, A, async () => (await db.query("select * from public.catalog_jobs")).rows)).toHaveLength(0);
    expect(await asUser(db, ADMIN, async () => (await db.query("select * from public.topic_requests")).rows)).toHaveLength(1);
    expect(await asUser(db, ADMIN, async () => (await db.query("select * from public.catalog_jobs")).rows)).toHaveLength(1);
    await asUser(db, A, async () => {
      await expect(db.query("select public.record_topic_request('x', 'x', null)")).rejects.toThrow(/permission denied/);
      await expect(db.query("select public.merge_knowledge_nodes(gen_random_uuid(), gen_random_uuid())")).rejects.toThrow(/permission denied/);
      await expect(db.query("insert into public.app_admins (user_id) values ($1)", [A])).rejects.toThrow(/row-level security/);
    });
  });

  it("anonymous visitors see nothing", async () => {
    expect(await asUser(db, null, async () => (await db.query("select id from public.knowledge_nodes limit 1")).rows)).toHaveLength(0);
  });

  it("aggregates topic requests anonymously", async () => {
    await asService(db, () => db.query("select public.record_topic_request('kintsugi', 'Kintsugi repair', null)"));
    const r = (await db.query<{ request_count: number }>("select request_count from public.topic_requests where query_key = 'kintsugi'")).rows[0];
    expect(r.request_count).toBe(2);
    const cols = (await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_name = 'topic_requests'")).rows.map((c) => c.column_name);
    expect(cols).not.toContain("user_id");
  });
});

describe("learner data stays private (user-owned tables)", () => {
  let journey: string;
  let version: string;
  let mod: string;
  let topic: string;

  beforeAll(async () => {
    await asUser(db, A, async () => {
      journey = (await db.query<{ id: string }>("insert into public.learning_journeys (user_id, title, subject) values ($1, 'Kintsugi', 'Kintsugi') returning id", [A])).rows[0].id;
      version = (await db.query<{ id: string }>("insert into public.curriculum_versions (journey_id, user_id, version, source) values ($1, $2, 1, 'ai') returning id", [journey, A])).rows[0].id;
      mod = (await db.query<{ id: string }>("insert into public.learning_modules (version_id, journey_id, user_id, position, level, title) values ($1, $2, $3, 0, 'beginner', 'Foundations') returning id", [version, journey, A])).rows[0].id;
      topic = (
        await db.query<{ id: string }>(
          "insert into public.learning_topics (module_id, version_id, journey_id, user_id, position, topic_key, title) values ($1, $2, $3, $4, 0, 'urushi', 'Urushi lacquer') returning id",
          [mod, version, journey, A],
        )
      ).rows[0].id;
      await db.query("insert into public.topic_mastery (user_id, topic_id, journey_id, mastery, status, lesson_completed_at) values ($1, $2, $3, 0.9, 'proficient', now())", [A, topic, journey]);
      await db.query("insert into public.curriculum_sources (user_id, version_id, url, title, provider, source_type, retrieved_at) values ($1, $2, 'https://en.wikipedia.org/wiki/Kintsugi', 'Kintsugi', 'Wikipedia', 'reference', now())", [A, version]);
    });
  });

  it("another user cannot read journeys, topics, mastery or curriculum sources", async () => {
    await asUser(db, B, async () => {
      for (const t of ["learning_journeys", "curriculum_versions", "learning_topics", "topic_mastery", "curriculum_sources"]) {
        expect((await db.query(`select * from public.${t}`)).rows, t).toHaveLength(0);
      }
    });
  });

  it("another user cannot attach rows to someone else's curriculum, even with a valid id", async () => {
    await asUser(db, B, async () => {
      await expect(db.query("insert into public.curriculum_sources (user_id, version_id, url, title, provider, source_type, retrieved_at) values ($1, $2, 'https://x.org', 'x', 'x', 'web', now())", [B, version])).rejects.toThrow();
      await expect(db.query("insert into public.learning_modules (version_id, journey_id, user_id, position, level, title) values ($1, $2, $3, 9, 'beginner', 'Hijack')", [version, journey, B])).rejects.toThrow();
      expect((await db.query("update public.topic_mastery set mastery = 0 where topic_id = $1", [topic])).affectedRows).toBe(0);
    });
  });

  it("TEST F — expanding the curriculum adds modules without touching existing progress", async () => {
    await asUser(db, A, async () => {
      const before = (await db.query("select * from public.topic_mastery where user_id = $1 order by topic_id", [A])).rows;
      await db.query("update public.learning_modules set position = position + 1 where version_id = $1", [version]);
      const pre = (await db.query<{ id: string }>("insert into public.learning_modules (version_id, journey_id, user_id, position, level, kind, title) values ($1, $2, $3, 0, 'beginner', 'prerequisites', 'Prerequisites') returning id", [version, journey, A])).rows[0].id;
      await db.query("insert into public.learning_topics (module_id, version_id, journey_id, user_id, position, topic_key, title, kind) values ($1, $2, $3, $4, 0, 'japanese-ceramics', 'Japanese ceramics basics', 'concept')", [pre, version, journey, A]);
      const after = (await db.query("select * from public.topic_mastery where user_id = $1 order by topic_id", [A])).rows;
      expect(after).toEqual(before);
      expect((await db.query<{ title: string }>("select title from public.learning_modules where version_id = $1 order by position", [version])).rows.map((r) => r.title)).toEqual(["Prerequisites", "Foundations"]);
    });
  });

  it("records learning events idempotently (offline replays never double-count)", async () => {
    await asUser(db, A, async () => {
      const id = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
      const first = await db.query<{ ok: boolean }>("select public.record_learning_event($1, 'lesson_completed', '2026-10-24', null, null, 12) as ok", [id]);
      const replay = await db.query<{ ok: boolean }>("select public.record_learning_event($1, 'lesson_completed', '2026-10-24', null, null, 12) as ok", [id]);
      expect([first.rows[0].ok, replay.rows[0].ok]).toEqual([true, false]);
      const day = (await db.query<{ lessons_completed: number; minutes: string }>("select lessons_completed, minutes from public.daily_activity where local_date = '2026-10-24'")).rows[0];
      expect(day.lessons_completed).toBe(1);
      expect(Number(day.minutes)).toBe(12);
    });
  });

  it("deleting an account removes all of that learner's data", async () => {
    await asUser(db, A, () => db.query("select public.delete_my_account()"));
    for (const t of ["learning_journeys", "curriculum_sources", "topic_mastery", "daily_activity", "learning_events"]) {
      expect((await db.query(`select 1 from public.${t} where user_id = $1`, [A])).rows, t).toHaveLength(0);
    }
    // Shared catalog content survives; authorship is simply cleared.
    expect((await db.query("select 1 from public.knowledge_nodes where path like 'practical-and-vocational-skills/woodworking/japanese-joinery'")).rows).toHaveLength(1);
  });
});
