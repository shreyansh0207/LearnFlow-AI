"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getJourneyOutline, nextTopic } from "@/lib/data";
import { isUuid, topicKey } from "@/lib/utils";
import { LEARNING_PATTERNS } from "@/lib/catalog/patterns";
import { setTopicSkipped } from "@/lib/learning/service";
import { CURRENT_LEVELS, TARGET_LEVELS } from "@/lib/validation";

export type ActionResult = { error?: string; ok?: boolean };

const title = z.string().trim().min(1, { message: "Title can't be empty" }).max(200);

function bad(msg = "That item no longer exists.") {
  return { error: msg };
}

export async function startJourney(journeyId: string) {
  if (!isUuid(journeyId)) return bad();
  const { db } = await requireUser();
  const outline = await getJourneyOutline(db, journeyId);
  if (!outline) return bad();
  await db.query("update public.learning_journeys set status = 'active' where id = $1", [journeyId]);
  revalidatePath(`/journeys/${journeyId}`);
  const first = nextTopic(outline);
  redirect(first ? `/lesson/${first.id}` : `/journeys/${journeyId}`);
}

export async function setJourneyStatus(journeyId: string, status: "active" | "paused" | "archived" | "completed"): Promise<ActionResult> {
  if (!isUuid(journeyId) || !["active", "paused", "archived", "completed"].includes(status)) return bad();
  const { db } = await requireUser();
  const rows = await db.query("update public.learning_journeys set status = $1 where id = $2 returning id", [status, journeyId]);
  if (!rows.length) return bad();
  revalidatePath(`/journeys/${journeyId}`);
  revalidatePath("/learning");
  return { ok: true };
}

export async function deleteJourney(journeyId: string): Promise<ActionResult> {
  if (!isUuid(journeyId)) return bad();
  const { db } = await requireUser();
  const rows = await db.query("delete from public.learning_journeys where id = $1 returning id", [journeyId]);
  if (!rows.length) return bad();
  revalidatePath("/learning");
  revalidatePath("/dashboard");
  redirect("/learning?deleted=1");
}

export async function renameModule(moduleId: string, newTitle: string): Promise<ActionResult> {
  const parsed = title.safeParse(newTitle);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!isUuid(moduleId)) return bad();
  const { db } = await requireUser();
  const row = await db.maybeOne<{ journey_id: string }>("update public.learning_modules set title = $1 where id = $2 returning journey_id", [parsed.data, moduleId]);
  if (!row) return bad();
  revalidatePath(`/journeys/${row.journey_id}`);
  return { ok: true };
}

export async function renameTopic(topicId: string, newTitle: string): Promise<ActionResult> {
  const parsed = title.safeParse(newTitle);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!isUuid(topicId)) return bad();
  const { db } = await requireUser();
  const row = await db.maybeOne<{ journey_id: string }>("update public.learning_topics set title = $1, topic_key = $2 where id = $3 returning journey_id", [
    parsed.data,
    topicKey(parsed.data),
    topicId,
  ]);
  if (!row) return bad();
  revalidatePath(`/journeys/${row.journey_id}`);
  return { ok: true };
}

export async function moveTopic(topicId: string, direction: "up" | "down"): Promise<ActionResult> {
  if (!isUuid(topicId)) return bad();
  const { db } = await requireUser();
  const journeyId = await db.tx(async (tx) => {
    const topic = await tx.maybeOne<{ id: string; module_id: string; position: number; journey_id: string }>(
      "select id, module_id, position, journey_id from public.learning_topics where id = $1",
      [topicId],
    );
    if (!topic) return null;
    const list = await tx.query<{ id: string; position: number }>("select id, position from public.learning_topics where module_id = $1 order by position", [topic.module_id]);
    const idx = list.findIndex((t) => t.id === topicId);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= list.length) return topic.journey_id;
    const other = list[swapIdx];
    await tx.query("update public.learning_topics set position = $1 where id = $2", [other.position, topicId]);
    await tx.query("update public.learning_topics set position = $1 where id = $2", [topic.position, other.id]);
    return topic.journey_id;
  });
  if (!journeyId) return bad();
  revalidatePath(`/journeys/${journeyId}`);
  return { ok: true };
}

/** Topics with learning history can't be removed, so no record of past study is ever destroyed. */
export async function removeTopic(topicId: string): Promise<ActionResult> {
  if (!isUuid(topicId)) return bad();
  const { db } = await requireUser();
  const topic = await db.maybeOne<{ journey_id: string; history: boolean }>(
    `select journey_id,
            exists (select 1 from public.lesson_sessions where topic_id = t.id) or exists (select 1 from public.assessment_attempts where topic_id = t.id) as history
       from public.learning_topics t where id = $1`,
    [topicId],
  );
  if (!topic) return bad();
  if (topic.history) return { error: "This topic has learning history, so it can't be removed. You can rename it instead." };
  await db.query("delete from public.learning_topics where id = $1", [topicId]);
  revalidatePath(`/journeys/${topic.journey_id}`);
  return { ok: true };
}

export async function addTopic(moduleId: string, newTitle: string): Promise<ActionResult> {
  const parsed = title.safeParse(newTitle);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!isUuid(moduleId)) return bad();
  const { db, user } = await requireUser();
  const mod = await db.maybeOne<{ id: string; version_id: string; journey_id: string }>("select id, version_id, journey_id from public.learning_modules where id = $1", [moduleId]);
  if (!mod) return bad();
  try {
    await db.query(
      `insert into public.learning_topics (module_id, version_id, journey_id, user_id, position, topic_key, title)
       values ($1, $2, $3, $4, (select coalesce(max(position), -1) + 1 from public.learning_topics where module_id = $1), $5, $6)`,
      [moduleId, mod.version_id, mod.journey_id, user.id, topicKey(parsed.data), parsed.data],
    );
  } catch {
    return { error: "Could not add the topic. Please try again." };
  }
  revalidatePath(`/journeys/${mod.journey_id}`);
  return { ok: true };
}

/** "I already know this" — skips the topic in "Up next" without faking completion or mastery. */
export async function setTopicKnown(topicId: string, known: boolean): Promise<ActionResult> {
  if (!isUuid(topicId)) return bad();
  const { db, user } = await requireUser();
  const topic = await db.maybeOne<{ journey_id: string }>("select journey_id from public.learning_topics where id = $1", [topicId]);
  if (!topic) return bad();
  try {
    await setTopicSkipped(db, user.id, topicId, topic.journey_id, known);
  } catch {
    return { error: "Could not update the topic." };
  }
  revalidatePath(`/journeys/${topic.journey_id}`);
  return { ok: true };
}

const GoalInput = z.object({
  goal: z.string().trim().max(1000).transform((v) => v || null),
  currentLevel: z.enum(CURRENT_LEVELS),
  targetLevel: z.enum(TARGET_LEVELS),
  learningPattern: z.enum(LEARNING_PATTERNS),
  scopeNotes: z.string().trim().max(1000).transform((v) => v || null),
});

/** Changes goal, difficulty, course shape or scope. Takes effect when the roadmap is regenerated. */
export async function updateJourneyGoal(journeyId: string, input: z.input<typeof GoalInput>): Promise<ActionResult> {
  if (!isUuid(journeyId)) return bad();
  const parsed = GoalInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { db } = await requireUser();
  const rows = await db.query(
    "update public.learning_journeys set goal = $1, current_level = $2, target_level = $3, learning_pattern = $4, scope_notes = $5 where id = $6 returning id",
    [parsed.data.goal, parsed.data.currentLevel, parsed.data.targetLevel, parsed.data.learningPattern, parsed.data.scopeNotes, journeyId],
  );
  if (!rows.length) return bad();
  revalidatePath(`/journeys/${journeyId}`);
  return { ok: true };
}
