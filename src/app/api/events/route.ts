import { NextResponse } from "next/server";
import { z } from "zod";
import { parseStoredLesson } from "@/lib/ai/schemas";
import { handleRouteError, parseJson } from "@/lib/api";
import { jsonError, requireApiUser } from "@/lib/auth";
import { getTopicContext } from "@/lib/data";
import { completeLesson, recordEvent } from "@/lib/learning/service";

const Body = z.discriminatedUnion("type", [
  z.object({ id: z.uuid(), type: z.literal("lesson_started"), topicId: z.uuid() }),
  z.object({
    id: z.uuid(),
    type: z.literal("lesson_completed"),
    topicId: z.uuid(),
    confidence: z.number().int().min(1).max(5).nullable().default(null),
    durationSeconds: z.number().min(0).max(86400).default(0),
    occurredAt: z.iso.datetime().optional(),
  }),
]);

/**
 * Records learning activity. The client-generated `id` is an idempotency key:
 * replays from the offline queue or double taps return `duplicate: true` and
 * never double-count progress, streaks or study time.
 */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) return auth;
  const { db, user, profile } = auth;

  const parsed = await parseJson(request, Body);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const ctx = await getTopicContext(db, body.topicId);
  if (!ctx) return jsonError(404, "not_found", "Topic not found.");

  const seen = await db.maybeOne("select id from public.learning_events where id = $1", [body.id]);
  if (seen) return NextResponse.json({ ok: true, duplicate: true });

  try {
    if (body.type === "lesson_started") {
      const open = await db.maybeOne(
        "select id from public.lesson_sessions where topic_id = $1 and completed_at is null and started_at > now() - interval '12 hours' limit 1",
        [body.topicId],
      );
      if (!open) {
        await db.query("insert into public.lesson_sessions (user_id, topic_id, journey_id) values ($1, $2, $3)", [user.id, body.topicId, ctx.journey.id]);
      }
      await db.query("update public.learning_journeys set last_topic_id = $1, last_studied_at = now() where id = $2", [body.topicId, ctx.journey.id]);
      await recordEvent(db, profile.timezone, { id: body.id, type: "lesson_started", journeyId: ctx.journey.id, topicId: body.topicId });
      return NextResponse.json({ ok: true });
    }

    // Prefer the standard lesson; fall back to the simpler variant ("standard" sorts after "simpler").
    const lessonRow = await db.maybeOne<{ content: unknown; source: "ai" | "demo" }>(
      "select content, source from public.lessons where topic_id = $1 order by variant desc limit 1",
      [body.topicId],
    );
    const lesson = lessonRow ? parseStoredLesson(lessonRow.content) : null;
    const at = body.occurredAt ? new Date(body.occurredAt) : new Date();
    // Ignore client clocks that claim the future; fall back to server time.
    const occurredAt = at.getTime() > Date.now() + 5 * 60_000 ? new Date() : at;

    const mastery = await completeLesson(db, {
      userId: user.id,
      timezone: profile.timezone,
      topicId: body.topicId,
      journeyId: ctx.journey.id,
      confidence: body.confidence,
      durationSeconds: body.durationSeconds,
      lesson,
      lessonSource: lessonRow?.source ?? null,
    });
    await recordEvent(db, profile.timezone, {
      id: body.id,
      type: "lesson_completed",
      journeyId: ctx.journey.id,
      topicId: body.topicId,
      minutes: Math.min(240, body.durationSeconds / 60),
      payload: { confidence: body.confidence },
      at: occurredAt,
    });
    return NextResponse.json({ ok: true, mastery });
  } catch (err) {
    return handleRouteError(err);
  }
}
