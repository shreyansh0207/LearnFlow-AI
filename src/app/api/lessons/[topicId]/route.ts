import { NextResponse } from "next/server";
import { z } from "zod";
import { buildLearnerContext } from "@/lib/ai/context";
import { generateLesson } from "@/lib/ai/generate";
import { handleRouteError, parseJson } from "@/lib/api";
import { jsonError, requireApiUser } from "@/lib/auth";
import { getTopicContext } from "@/lib/data";
import { singleFlight } from "@/lib/ai/client";
import { isUuid } from "@/lib/utils";

export const maxDuration = 120;

const Body = z.object({ variant: z.enum(["standard", "simpler"]).default("standard"), regenerate: z.boolean().default(false) });

/** Generates and stores the lesson for a topic (or returns the stored one). */
export async function POST(request: Request, { params }: { params: Promise<{ topicId: string }> }) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) return auth;
  const { db, user } = auth;
  const { topicId } = await params;
  if (!isUuid(topicId)) return jsonError(404, "not_found", "Topic not found.");

  const parsed = await parseJson(request, Body);
  if (!parsed.ok) return parsed.response;
  const { variant, regenerate } = parsed.data;

  const ctx = await getTopicContext(db, topicId);
  if (!ctx) return jsonError(404, "not_found", "Topic not found.");

  if (!regenerate) {
    const existing = await db.maybeOne<{ id: string }>("select id from public.lessons where topic_id = $1 and variant = $2", [topicId, variant]);
    if (existing) return NextResponse.json({ lessonId: existing.id, cached: true });
  }

  try {
    // Identical concurrent requests (double clicks, retries while waiting) share one Groq call.
    const result = await singleFlight(`lesson:${user.id}:${topicId}:${variant}:${regenerate}`, () => generateAndSave());
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }

  async function generateAndSave() {
    const [{ text: learnerContext }, prefs] = await Promise.all([
      buildLearnerContext(db, user.id, ctx!.journey.id),
      db.maybeOne<{ explanation_language: string }>("select explanation_language from public.user_preferences where user_id = $1", [user.id]),
    ]);
    const generated = await generateLesson(
      { db, userId: user.id },
      {
        journeyTitle: ctx!.journey.title,
        subject: ctx!.journey.subject,
        moduleTitle: ctx!.module.title,
        level: ctx!.module.level,
        topicTitle: ctx!.topic.title,
        topicSummary: ctx!.topic.summary,
        objectives: ctx!.topic.objectives,
        prerequisites: ctx!.topic.prerequisites,
        estimatedMinutes: ctx!.topic.estimated_minutes,
        learnerContext,
        variant,
        language: prefs?.explanation_language === "hinglish" ? "hinglish" : "en",
      },
    );
    const saved = await db.one<{ id: string }>(
      `insert into public.lessons (topic_id, user_id, variant, content, source, model) values ($1, $2, $3, $4, $5, $6)
       on conflict (topic_id, variant) do update set content = excluded.content, source = excluded.source, model = excluded.model, created_at = now()
       returning id`,
      [topicId, user.id, variant, JSON.stringify(generated.data), generated.source, generated.model],
    );
    return { lessonId: saved.id, source: generated.source };
  }
}
