"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isUuid } from "@/lib/utils";

export type NoteResult = { error?: string; ok?: boolean };

const body = z.string().trim().min(1, { message: "Write something first" }).max(20000);

export async function toggleBookmark(topicId: string): Promise<NoteResult & { bookmarked?: boolean }> {
  if (!isUuid(topicId)) return { error: "Topic not found." };
  const { db, user } = await requireUser();
  const removed = await db.query("delete from public.bookmarks where topic_id = $1 returning id", [topicId]);
  if (removed.length) {
    revalidatePath("/notes");
    return { ok: true, bookmarked: false };
  }
  const topic = await db.maybeOne<{ journey_id: string }>("select journey_id from public.learning_topics where id = $1", [topicId]);
  if (!topic) return { error: "Topic not found." };
  try {
    await db.query("insert into public.bookmarks (user_id, topic_id, journey_id) values ($1, $2, $3) on conflict (user_id, topic_id) do nothing", [user.id, topicId, topic.journey_id]);
  } catch {
    return { error: "Could not save the bookmark." };
  }
  revalidatePath("/notes");
  return { ok: true, bookmarked: true };
}

export async function createNote(input: { topicId?: string | null; body: string }): Promise<NoteResult> {
  const parsed = body.safeParse(input.body);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { db, user } = await requireUser();
  let journeyId: string | null = null;
  let topicId: string | null = null;
  if (input.topicId) {
    if (!isUuid(input.topicId)) return { error: "Topic not found." };
    const topic = await db.maybeOne<{ id: string; journey_id: string }>("select id, journey_id from public.learning_topics where id = $1", [input.topicId]);
    if (!topic) return { error: "Topic not found." };
    topicId = topic.id;
    journeyId = topic.journey_id;
  }
  try {
    await db.query("insert into public.user_notes (user_id, topic_id, journey_id, body) values ($1, $2, $3, $4)", [user.id, topicId, journeyId, parsed.data]);
  } catch {
    return { error: "Could not save your note. Please try again." };
  }
  revalidatePath("/notes");
  if (topicId) revalidatePath(`/lesson/${topicId}`);
  return { ok: true };
}

export async function updateNote(noteId: string, text: string): Promise<NoteResult> {
  const parsed = body.safeParse(text);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!isUuid(noteId)) return { error: "Note not found." };
  const { db } = await requireUser();
  const row = await db.maybeOne<{ topic_id: string | null }>("update public.user_notes set body = $1 where id = $2 returning topic_id", [parsed.data, noteId]);
  if (!row) return { error: "Note not found." };
  revalidatePath("/notes");
  if (row.topic_id) revalidatePath(`/lesson/${row.topic_id}`);
  return { ok: true };
}

export async function deleteNote(noteId: string): Promise<NoteResult> {
  if (!isUuid(noteId)) return { error: "Note not found." };
  const { db } = await requireUser();
  const row = await db.maybeOne<{ topic_id: string | null }>("delete from public.user_notes where id = $1 returning topic_id", [noteId]);
  if (!row) return { error: "Note not found." };
  revalidatePath("/notes");
  if (row.topic_id) revalidatePath(`/lesson/${row.topic_id}`);
  return { ok: true };
}
