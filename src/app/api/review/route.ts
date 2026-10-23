import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, parseJson } from "@/lib/api";
import { jsonError, requireApiUser } from "@/lib/auth";
import { localDate } from "@/lib/learning/dates";
import { applyReviewToMastery, recordEvent } from "@/lib/learning/service";
import { schedule } from "@/lib/learning/spaced-repetition";
import { pgCode } from "@/lib/db";

const Body = z.object({
  id: z.uuid(),
  itemId: z.uuid(),
  rating: z.enum(["again", "hard", "good", "easy"]),
  occurredAt: z.iso.datetime().optional(),
});

/**
 * Records a review rating and reschedules the card. The client-generated id
 * makes this idempotent, so offline replays never apply a rating twice.
 */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) return auth;
  const { db, user, profile } = auth;

  const parsed = await parseJson(request, Body);
  if (!parsed.ok) return parsed.response;
  const { id, itemId, rating } = parsed.data;

  const seen = await db.maybeOne<{ id: string; new_interval: number }>("select id, new_interval from public.review_attempts where id = $1", [id]);
  if (seen) return NextResponse.json({ ok: true, duplicate: true, intervalDays: seen.new_interval });

  const item = await db.maybeOne<{ id: string; journey_id: string | null; topic_id: string | null; interval_days: number; ease: number; repetitions: number; lapses: number }>(
    "select id, journey_id, topic_id, interval_days, ease, repetitions, lapses from public.review_items where id = $1",
    [itemId],
  );
  if (!item) return jsonError(404, "not_found", "Review card not found.");

  const requested = parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date();
  const at = requested.getTime() > Date.now() + 5 * 60_000 ? new Date() : requested;
  const day = localDate(at, profile.timezone);

  try {
    const next = schedule({ intervalDays: item.interval_days, ease: Number(item.ease), repetitions: item.repetitions, lapses: item.lapses }, rating, day);

    try {
      await db.query(
        "insert into public.review_attempts (id, user_id, review_item_id, rating, prev_interval, new_interval, local_date, reviewed_at) values ($1, $2, $3, $4, $5, $6, $7, $8)",
        [id, user.id, itemId, rating, item.interval_days, next.intervalDays, day, at.toISOString()],
      );
    } catch (e) {
      if (pgCode(e) === "23505") return NextResponse.json({ ok: true, duplicate: true });
      return jsonError(500, "data_error", "Your review couldn't be saved. Please try again.");
    }

    await db.query(
      "update public.review_items set interval_days = $1, ease = $2, repetitions = $3, lapses = $4, due_date = $5, last_reviewed_at = $6 where id = $7",
      [next.intervalDays, next.ease, next.repetitions, next.lapses, next.dueDate, at.toISOString(), itemId],
    );

    if (item.topic_id && item.journey_id) {
      await applyReviewToMastery(db, user.id, item.topic_id, item.journey_id, rating);
    }
    await recordEvent(db, profile.timezone, {
      id,
      type: "review_completed",
      journeyId: item.journey_id,
      topicId: item.topic_id,
      payload: { rating },
      at,
    });
    return NextResponse.json({ ok: true, intervalDays: next.intervalDays, dueDate: next.dueDate });
  } catch (err) {
    return handleRouteError(err);
  }
}
