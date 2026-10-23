"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { addDays, localDate } from "@/lib/learning/dates";
import { isUuid } from "@/lib/utils";

export type CardResult = { error?: string; ok?: boolean };

const CardInput = z.object({
  front: z.string().trim().min(1, { message: "Add a question or prompt" }).max(2000),
  back: z.string().trim().min(1, { message: "Add an answer" }).max(4000),
  journeyId: z.string().optional(),
});

export async function createCard(input: { front: string; back: string; journeyId?: string }): Promise<CardResult> {
  const parsed = CardInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { db, user, profile } = await requireUser();
  let journeyId: string | null = null;
  if (parsed.data.journeyId && isUuid(parsed.data.journeyId)) {
    const row = await db.maybeOne<{ id: string }>("select id from public.learning_journeys where id = $1", [parsed.data.journeyId]);
    journeyId = row?.id ?? null;
  }
  try {
    await db.query("insert into public.review_items (user_id, journey_id, kind, source, front, back, due_date) values ($1, $2, 'flashcard', 'user', $3, $4, $5)", [
      user.id,
      journeyId,
      parsed.data.front,
      parsed.data.back,
      addDays(localDate(new Date(), profile.timezone), 1),
    ]);
  } catch {
    return { error: "Could not save the card." };
  }
  revalidatePath("/flashcards");
  return { ok: true };
}

export async function updateCard(id: string, input: { front: string; back: string }): Promise<CardResult> {
  const parsed = CardInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!isUuid(id)) return { error: "Card not found." };
  const { db } = await requireUser();
  const rows = await db.query("update public.review_items set front = $1, back = $2 where id = $3 returning id", [parsed.data.front, parsed.data.back, id]);
  if (!rows.length) return { error: "Card not found." };
  revalidatePath("/flashcards");
  return { ok: true };
}

export async function setCardSuspended(id: string, suspended: boolean): Promise<CardResult> {
  if (!isUuid(id)) return { error: "Card not found." };
  const { db } = await requireUser();
  const rows = await db.query("update public.review_items set suspended = $1 where id = $2 returning id", [suspended, id]);
  if (!rows.length) return { error: "Card not found." };
  revalidatePath("/flashcards");
  revalidatePath("/review");
  return { ok: true };
}

export async function deleteCard(id: string): Promise<CardResult> {
  if (!isUuid(id)) return { error: "Card not found." };
  const { db } = await requireUser();
  const rows = await db.query("delete from public.review_items where id = $1 returning id", [id]);
  if (!rows.length) return { error: "Card not found." };
  revalidatePath("/flashcards");
  revalidatePath("/review");
  return { ok: true };
}
