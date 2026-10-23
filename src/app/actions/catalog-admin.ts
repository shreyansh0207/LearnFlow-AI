"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { LEARNING_PATTERNS } from "@/lib/catalog/patterns";
import { getNode, insertNode } from "@/lib/catalog/repository";
import { DIFFICULTIES } from "@/lib/catalog/schemas";
import { pgCode, serviceDb } from "@/lib/db";
import { isUuid, topicKey } from "@/lib/utils";

export type AdminResult = { error?: string; ok?: boolean; message?: string };

/**
 * Admin check runs on the server for every action. Being an admin is a row in
 * app_admins (granted with SQL); the UI hiding buttons is never relied on.
 */
async function requireAdmin() {
  const { db, user } = await requireUser();
  const admin = await db.maybeOne("select user_id from public.app_admins where user_id = $1", [user.id]);
  if (!admin) return { error: "You don't have permission to manage the catalog." } as const;
  return { db, user, service: serviceDb() } as const;
}

const done = (message?: string): AdminResult => {
  revalidatePath("/admin/catalog");
  revalidatePath("/library");
  return { ok: true, message };
};

export async function setNodeStatus(id: string, status: "verified" | "reviewed" | "proposed" | "rejected"): Promise<AdminResult> {
  if (!isUuid(id) || !["verified", "reviewed", "proposed", "rejected"].includes(status)) return { error: "Invalid request." };
  const admin = await requireAdmin();
  if ("error" in admin) return { error: admin.error };
  const rows = await admin.service.query("update public.knowledge_nodes set status = $1 where id = $2 and status <> 'merged' returning id", [status, id]).catch(() => []);
  if (!rows.length) return { error: "Could not update that topic." };
  revalidatePath(`/topics/${id}`);
  return done();
}

export async function mergeNodes(sourceId: string, targetId: string): Promise<AdminResult> {
  if (!isUuid(sourceId) || !isUuid(targetId) || sourceId === targetId) return { error: "Choose two different topics." };
  const admin = await requireAdmin();
  if ("error" in admin) return { error: admin.error };
  try {
    await admin.service.query("select public.merge_knowledge_nodes($1, $2)", [sourceId, targetId]);
  } catch (e) {
    return { error: `Merge failed: ${(e as Error).message}` };
  }
  revalidatePath(`/topics/${targetId}`);
  return done("Merged. Children, links, sources and learner journeys now point to the target topic.");
}

const NodeInput = z.object({
  parentId: z.uuid({ message: "Choose a parent topic" }),
  name: z.string().trim().min(2).max(200),
  aliases: z.string().max(1000).default(""),
  description: z.string().trim().max(4000).default(""),
  kind: z.enum(["discipline", "subject", "subdiscipline", "topic", "subtopic", "concept", "skill", "field"]),
  difficulty: z.enum(DIFFICULTIES).or(z.literal("")).default(""),
  pattern: z.enum(LEARNING_PATTERNS).or(z.literal("")).default(""),
});

const splitAliases = (s: string) => s.split(",").map((a) => a.trim()).filter(Boolean).slice(0, 12);

/** Adds a curated topic at runtime — no code change or redeploy needed. */
export async function createCuratedNode(input: z.input<typeof NodeInput>): Promise<AdminResult> {
  const parsed = NodeInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const admin = await requireAdmin();
  if ("error" in admin) return { error: admin.error };
  const parent = await getNode(admin.service, parsed.data.parentId);
  if (!parent || parent.status === "merged") return { error: "Parent topic not found." };
  try {
    const r = await insertNode(admin.service, {
      parent: { id: parent.id, path: parent.path },
      name: parsed.data.name,
      aliases: splitAliases(parsed.data.aliases),
      description: parsed.data.description || null,
      kind: parsed.data.kind,
      difficulty: parsed.data.difficulty || null,
      pattern: parsed.data.pattern || null,
      origin: "curated",
      status: "verified",
      createdBy: admin.user.id,
    });
    return done(r.created ? "Topic added." : "A matching topic already existed under that parent, so nothing new was created.");
  } catch (e) {
    return { error: (e as Error).message };
  }
}

const EditInput = z.object({
  name: z.string().trim().min(2).max(200),
  aliases: z.string().max(1000).default(""),
  description: z.string().trim().max(4000).default(""),
});

export async function editNode(id: string, input: z.input<typeof EditInput>): Promise<AdminResult> {
  if (!isUuid(id)) return { error: "Invalid request." };
  const parsed = EditInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const admin = await requireAdmin();
  if ("error" in admin) return { error: admin.error };
  const aliases = splitAliases(parsed.data.aliases);
  try {
    await admin.service.query("update public.knowledge_nodes set name = $1, name_key = $2, aliases = $3, alias_keys = $4, description = $5 where id = $6", [
      parsed.data.name,
      topicKey(parsed.data.name),
      aliases,
      aliases.map(topicKey),
      parsed.data.description || null,
      id,
    ]);
  } catch (e) {
    return { error: pgCode(e) === "23505" ? "Another topic with that name already exists under the same parent. Merge them instead." : "Could not save changes." };
  }
  revalidatePath(`/topics/${id}`);
  return done();
}

export async function setRequestStatus(id: number, status: "open" | "resolved" | "ignored"): Promise<AdminResult> {
  if (!Number.isInteger(id) || !["open", "resolved", "ignored"].includes(status)) return { error: "Invalid request." };
  const admin = await requireAdmin();
  if ("error" in admin) return { error: admin.error };
  await admin.service.query("update public.topic_requests set status = $1 where id = $2", [status, id]);
  return done();
}

type ImportItem = { name: string; aliases?: string[]; description?: string; kind?: string; children?: ImportItem[] };

const ImportNode: z.ZodType<ImportItem> = z.lazy(() =>
  z.object({
    name: z.string().trim().min(2).max(200),
    aliases: z.array(z.string().max(120)).max(12).optional(),
    description: z.string().max(4000).optional(),
    kind: z.enum(["discipline", "subject", "subdiscipline", "topic", "subtopic", "concept", "skill", "field"]).optional(),
    children: z.array(ImportNode).max(100).optional(),
  }),
);

/**
 * Curated bulk import: a JSON tree placed under an existing parent. Imported
 * nodes are marked origin "imported", status "reviewed". Duplicates are reused.
 */
export async function importNodes(parentId: string, json: string): Promise<AdminResult> {
  if (!isUuid(parentId)) return { error: "Choose a parent topic." };
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { error: "That isn't valid JSON." };
  }
  const parsed = z.array(ImportNode).max(200).safeParse(data);
  if (!parsed.success) return { error: `Invalid import: ${parsed.error.issues[0].path.join(".")} ${parsed.error.issues[0].message}` };
  const admin = await requireAdmin();
  if ("error" in admin) return { error: admin.error };
  const root = await getNode(admin.service, parentId);
  if (!root) return { error: "Parent topic not found." };

  let created = 0;
  let reused = 0;
  let budget = 500;
  const walk = async (items: ImportItem[], parent: { id: string; path: string }) => {
    for (const item of items) {
      if (budget-- <= 0) return;
      const r = await insertNode(admin.service, {
        parent,
        name: item.name,
        aliases: item.aliases,
        description: item.description ?? null,
        kind: item.kind ?? "topic",
        origin: "imported",
        status: "reviewed",
        createdBy: admin.user.id,
      });
      if (r.created) created++;
      else reused++;
      if (item.children?.length) await walk(item.children, { id: r.id, path: r.path });
    }
  };
  try {
    await walk(parsed.data, { id: root.id, path: root.path });
  } catch (e) {
    return { error: `Import stopped: ${(e as Error).message}. ${created} topics were added before the error.` };
  }
  return done(`Imported: ${created} new topic(s), ${reused} existing topic(s) reused.${budget <= 0 ? " Stopped at the 500-topic limit." : ""}`);
}
