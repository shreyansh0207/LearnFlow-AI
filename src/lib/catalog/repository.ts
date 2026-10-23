import "server-only";
import { pgCode, type Db } from "@/lib/db";
import { topicKey } from "@/lib/utils";
import type { SourceDoc } from "@/lib/sources/types";
import type { CatalogHit } from "./plan";
import type { Branches, TopicProposal } from "./schemas";
import { findDuplicate, pathSegment } from "./text";

/**
 * Data access for the shared knowledge catalog. Reads use the signed-in user's
 * scoped connection (RLS: read-only). Writes take serviceDb() and are only called
 * after input has been validated.
 */

export type NodeOrigin = "curated" | "imported" | "ai_generated" | "user_suggested";

export type CatalogNode = {
  id: string;
  parent_id: string | null;
  domain_id: string | null;
  path: string;
  name: string;
  name_key: string;
  aliases: string[];
  description: string | null;
  kind: string;
  difficulty: string | null;
  learning_objectives: string[];
  learning_pattern: string | null;
  icon: string | null;
  origin: NodeOrigin;
  status: string;
  merged_into: string | null;
  request_count: number;
  created_at: string;
};

export const NODE_COLUMNS =
  "id, parent_id, domain_id, path, name, name_key, aliases, description, kind, difficulty, learning_objectives, learning_pattern, icon, origin, status, merged_into, request_count, created_at";

const DEFAULT_DOMAIN_PATH = "emerging-and-specialized-knowledge";

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function searchCatalog(db: Db, query: string, opts: { limit?: number; offset?: number; domainId?: string | null } = {}): Promise<CatalogHit[]> {
  const q = query.trim().slice(0, 200);
  if (q.length < 2) return [];
  try {
    return await db.query<CatalogHit>("select * from public.search_knowledge($1, $2, $3, $4, $5)", [q, topicKey(q) || null, opts.limit ?? 20, opts.offset ?? 0, opts.domainId ?? null]);
  } catch (e) {
    console.error("[learnflow] catalog search failed:", (e as Error).message);
    return [];
  }
}

/** Searches several names (topic + synonyms) and keeps each node's best rank. */
export async function searchMany(db: Db, names: string[], limit = 12): Promise<CatalogHit[]> {
  const results = await Promise.all(Array.from(new Set(names.filter((n) => n.trim().length >= 2))).slice(0, 5).map((n) => searchCatalog(db, n, { limit })));
  const best = new Map<string, CatalogHit>();
  for (const hit of results.flat()) {
    const prev = best.get(hit.id);
    if (!prev || hit.rank > prev.rank) best.set(hit.id, hit);
  }
  return [...best.values()].sort((a, b) => b.rank - a.rank).slice(0, limit);
}

export type DomainRow = { id: string; name: string; description: string | null; icon: string | null; learning_pattern: string | null; path: string };

export async function listDomains(db: Db): Promise<DomainRow[]> {
  return db.query<DomainRow>("select id, name, description, icon, learning_pattern, path from public.knowledge_nodes where kind = 'domain' and parent_id is null order by name");
}

export async function getNode(db: Db, id: string): Promise<CatalogNode | null> {
  return db.maybeOne<CatalogNode>(`select ${NODE_COLUMNS} from public.knowledge_nodes where id = $1`, [id]);
}

export const CHILD_PAGE_SIZE = 30;

type Ref = { id: string; name: string; status: string };

export async function getNodeDetail(db: Db, id: string, childPage = 1) {
  const node = await getNode(db, id);
  if (!node) return null;
  const from = (Math.max(1, childPage) - 1) * CHILD_PAGE_SIZE;
  const [ancestors, children, childCount, prerequisites, unlocks, related, sources] = await Promise.all([
    db.query<{ id: string; name: string }>("select id, name from public.knowledge_ancestors($1)", [id]),
    db.query<{ id: string; name: string; description: string | null; kind: string; difficulty: string | null; origin: string; status: string }>(
      `select id, name, description, kind, difficulty, origin, status from public.knowledge_nodes
        where parent_id = $1 order by status desc, name limit $2 offset $3`,
      [id, CHILD_PAGE_SIZE, from],
    ),
    db.count("select count(*)::int as count from public.knowledge_nodes where parent_id = $1", [id]),
    db.query<Ref & { note: string | null }>(
      `select n.id, n.name, n.status, e.note from public.knowledge_edges e join public.knowledge_nodes n on n.id = e.target_id
        where e.node_id = $1 and e.relation = 'prerequisite' order by n.name`,
      [id],
    ),
    db.query<Ref>(
      `select n.id, n.name, n.status from public.knowledge_edges e join public.knowledge_nodes n on n.id = e.node_id
        where e.target_id = $1 and e.relation = 'prerequisite' order by n.name limit 12`,
      [id],
    ),
    db.query<Ref>(
      `select n.id, n.name, n.status from public.knowledge_edges e join public.knowledge_nodes n on n.id = e.target_id
        where e.node_id = $1 and e.relation = 'related' order by n.name`,
      [id],
    ),
    db.query<{ id: string; url: string; title: string; provider: string; source_type: string; authors: string | null; published: string | null; license: string | null; snippet: string | null; retrieved_at: string }>(
      "select id, url, title, provider, source_type, authors, published, license, snippet, retrieved_at from public.knowledge_sources where node_id = $1 order by created_at",
      [id],
    ),
  ]);
  return { node, ancestors, children, childCount, prerequisites, unlocks, related, sources };
}

/** Compact text outline of a node and its catalog neighbourhood, used as hints for curriculum generation. */
export async function catalogHints(db: Db, nodeId: string): Promise<string | null> {
  const detail = await getNodeDetail(db, nodeId);
  if (!detail) return null;
  const { node } = detail;
  const lines = [
    `${node.name}${node.status === "verified" ? "" : " (unreviewed)"}${node.description ? `: ${node.description}` : ""}`,
    detail.ancestors.length ? `Part of: ${detail.ancestors.map((a) => a.name).join(" › ")}` : "",
    detail.prerequisites.length ? `Prerequisites: ${detail.prerequisites.map((p) => p.name).join("; ")}` : "",
    detail.children.length ? `Branches: ${detail.children.map((c) => c.name).join("; ")}` : "",
    node.learning_objectives.length ? `Objectives: ${node.learning_objectives.join("; ")}` : "",
    detail.related.length ? `Related: ${detail.related.map((r) => r.name).join("; ")}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

type Candidate = { id: string; name: string; aliases: string[]; path: string; parent_id: string | null; status: string };

async function findByKeys(db: Db, keys: string[], parentId?: string | null): Promise<Candidate[]> {
  const clean = Array.from(new Set(keys.filter(Boolean)));
  if (!clean.length) return [];
  const params: unknown[] = [clean];
  let parentFilter = "";
  if (parentId !== undefined) {
    if (parentId === null) parentFilter = "and parent_id is null";
    else {
      params.push(parentId);
      parentFilter = "and parent_id = $2";
    }
  }
  return db.query<Candidate>(
    `select id, name, aliases, path, parent_id, status from public.knowledge_nodes
      where status not in ('merged', 'rejected') and (name_key = any($1::text[]) or alias_keys && $1::text[]) ${parentFilter}
      limit 40`,
    params,
  );
}

/** Existing node for this name anywhere in the catalog (exact name, alias, or spelling/spacing variant). */
export async function findExisting(db: Db, name: string, aliases: string[] = []) {
  const exact = await findByKeys(db, [topicKey(name), ...aliases.map(topicKey)]);
  const fuzzy = exact.length ? [] : (await searchCatalog(db, name, { limit: 8 })).map((h) => ({ id: h.id, name: h.name, aliases: h.aliases, path: h.path, parent_id: h.parent_id, status: h.status }));
  return findDuplicate(name, aliases, [...exact, ...fuzzy]);
}

export async function resolveDomain(db: Db, domainName: string | null | undefined) {
  if (domainName) {
    const key = topicKey(domainName);
    const row = await db.maybeOne<{ id: string; name: string; path: string }>(
      "select id, name, path from public.knowledge_nodes where kind = 'domain' and parent_id is null and (name_key = $1 or alias_keys @> array[$1]) limit 1",
      [key],
    );
    if (row) return row;
  }
  return db.maybeOne<{ id: string; name: string; path: string }>("select id, name, path from public.knowledge_nodes where path = $1", [DEFAULT_DOMAIN_PATH]);
}

// ---------------------------------------------------------------------------
// Writes (serviceDb only)
// ---------------------------------------------------------------------------

type NewNode = {
  parent: { id: string; path: string } | null;
  name: string;
  aliases?: string[];
  description?: string | null;
  kind: string;
  difficulty?: string | null;
  objectives?: string[];
  pattern?: string | null;
  origin: NodeOrigin;
  status?: "proposed" | "reviewed" | "verified";
  createdBy?: string | null;
};

/** Inserts a node unless an equivalent one already exists under the same parent; idempotent under races. */
export async function insertNode(service: Db, n: NewNode): Promise<{ id: string; path: string; created: boolean }> {
  const nameKey = topicKey(n.name);
  if (!nameKey) throw new Error("Invalid topic name");
  const siblings = await findByKeys(service, [nameKey, ...(n.aliases ?? []).map(topicKey)], n.parent?.id ?? null);
  const dup = findDuplicate(n.name, n.aliases ?? [], siblings);
  if (dup) return { id: dup.match.id, path: dup.match.path, created: false };

  const aliases = (n.aliases ?? []).filter((a) => topicKey(a) && topicKey(a) !== nameKey);
  const base = n.parent ? `${n.parent.path}/${pathSegment(n.name)}` : pathSegment(n.name);
  for (let attempt = 0; attempt < 3; attempt++) {
    const path = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 7)}`;
    try {
      const row = await service.one<{ id: string; path: string }>(
        `insert into public.knowledge_nodes (parent_id, path, name, name_key, aliases, alias_keys, description, kind, difficulty, learning_objectives, learning_pattern, origin, status, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) returning id, path`,
        [
          n.parent?.id ?? null,
          path,
          n.name,
          nameKey,
          aliases,
          aliases.map(topicKey),
          n.description ?? null,
          n.kind,
          n.difficulty ?? null,
          n.objectives ?? [],
          n.pattern ?? null,
          n.origin,
          n.status ?? "proposed",
          n.createdBy ?? null,
        ],
      );
      return { ...row, created: true };
    } catch (e) {
      if (pgCode(e) !== "23505") throw new Error(`Could not save topic: ${(e as Error).message}`);
      // Unique violation: a concurrent insert of the same name (reuse it) or a path clash (retry).
      const again = await findByKeys(service, [nameKey], n.parent?.id ?? null);
      if (again[0]) return { id: again[0].id, path: again[0].path, created: false };
    }
  }
  throw new Error("Could not allocate a unique path for the topic");
}

async function addEdge(service: Db, nodeId: string, targetId: string, relation: "prerequisite" | "related", origin: NodeOrigin, note?: string | null) {
  if (nodeId === targetId) return;
  await service.query("insert into public.knowledge_edges (node_id, target_id, relation, origin, note) values ($1, $2, $3, $4, $5) on conflict do nothing", [
    nodeId,
    targetId,
    relation,
    origin,
    note?.slice(0, 500) ?? null,
  ]);
}

export async function linkRelated(service: Db, nodeId: string, targetIds: string[], origin: NodeOrigin) {
  for (const t of targetIds) await addEdge(service, nodeId, t, "related", origin);
}

export async function attachSources(service: Db, nodeId: string, sources: SourceDoc[]) {
  for (const s of sources) {
    await service.query(
      `insert into public.knowledge_sources (node_id, url, title, provider, source_type, authors, published, license, snippet, retrieved_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) on conflict (node_id, url) do nothing`,
      [nodeId, s.url, s.title, s.provider, s.type, s.authors, s.published, s.license, s.snippet, s.retrievedAt],
    );
  }
}

/**
 * Saves a validated AI/user proposal as UNVERIFIED catalog content: the topic,
 * its subtopics, prerequisite links (reusing existing concepts where possible)
 * and the sources retrieved while proposing it.
 */
export async function saveProposal(
  service: Db,
  p: TopicProposal,
  opts: { parent: { id: string; path: string }; origin: NodeOrigin; createdBy: string | null; sources: SourceDoc[] },
): Promise<{ nodeId: string; created: boolean }> {
  const existing = await findExisting(service, p.name, p.aliases);
  if (existing) return { nodeId: existing.match.id, created: false };

  const topic = await insertNode(service, {
    parent: opts.parent,
    name: p.name,
    aliases: p.aliases,
    description: p.description,
    kind: p.kind,
    difficulty: p.difficulty,
    objectives: p.objectives,
    pattern: p.learningPattern,
    origin: opts.origin,
    createdBy: opts.createdBy,
  });
  const self = { id: topic.id, path: topic.path };

  for (const s of p.subtopics) {
    await insertNode(service, { parent: self, name: s.name, description: s.description, kind: "subtopic", origin: opts.origin, createdBy: opts.createdBy });
  }
  for (const pre of p.prerequisites) {
    const found = await findExisting(service, pre.name);
    const targetId = found
      ? found.match.id
      : (await insertNode(service, { parent: opts.parent, name: pre.name, description: pre.reason, kind: "concept", origin: opts.origin, createdBy: opts.createdBy })).id;
    await addEdge(service, topic.id, targetId, "prerequisite", opts.origin, pre.reason);
  }
  for (const r of p.related) {
    const found = await findExisting(service, r);
    if (found) await addEdge(service, topic.id, found.match.id, "related", opts.origin);
  }
  await attachSources(service, topic.id, opts.sources);
  return { nodeId: topic.id, created: topic.created };
}

export async function saveBranches(service: Db, parent: { id: string; path: string }, b: Branches, origin: NodeOrigin, createdBy: string | null) {
  const ids: string[] = [];
  for (const br of b.branches) {
    const r = await insertNode(service, { parent, name: br.name, description: br.description, kind: br.kind, difficulty: br.difficulty, origin, createdBy });
    ids.push(r.id);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Observability & demand (never block the user's request)
// ---------------------------------------------------------------------------

export async function recordJob(service: Db | null, job: { kind: string; status: "succeeded" | "failed"; topic?: string; nodeId?: string | null; errorCode?: string | null; durationMs?: number }) {
  if (!service) return;
  try {
    await service.query("insert into public.catalog_jobs (kind, status, topic, node_id, error_code, duration_ms) values ($1, $2, $3, $4, $5, $6)", [
      job.kind,
      job.status,
      job.topic?.slice(0, 200) ?? null,
      job.nodeId ?? null,
      job.errorCode?.slice(0, 60) ?? null,
      job.durationMs ?? null,
    ]);
  } catch (e) {
    console.warn("[learnflow] could not record catalog job:", (e as Error).message);
  }
}

export async function recordTopicRequest(service: Db | null, key: string, display: string, nodeId: string | null) {
  if (!service || !key) return;
  try {
    await service.query("select public.record_topic_request($1, $2, $3)", [key, display, nodeId]);
  } catch (e) {
    console.warn("[learnflow] could not record topic request:", (e as Error).message);
  }
}
