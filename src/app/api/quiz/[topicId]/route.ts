import { NextResponse } from "next/server";
import { z } from "zod";
import { buildLearnerContext } from "@/lib/ai/context";
import { generateQuiz } from "@/lib/ai/generate";
import { parseStoredLesson } from "@/lib/ai/schemas";
import { handleRouteError, parseJson } from "@/lib/api";
import { jsonError, requireApiUser } from "@/lib/auth";
import { getTopicContext } from "@/lib/data";
import { saveAssessment } from "@/lib/learning/assessments";
import { nextDifficulty } from "@/lib/learning/scoring";
import { isUuid } from "@/lib/utils";
import { singleFlight } from "@/lib/ai/client";

export const maxDuration = 120;

const Body = z.object({ mode: z.enum(["quiz", "practice", "harder"]).default("quiz") });

/**
 * Generates a topic quiz. Difficulty adapts to the latest score; practice mode
 * targets concepts the learner previously got wrong at an easier level.
 */
export async function POST(request: Request, { params }: { params: Promise<{ topicId: string }> }) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) return auth;
  const { db, user } = auth;
  const { topicId } = await params;
  if (!isUuid(topicId)) return jsonError(404, "not_found", "Topic not found.");

  const parsed = await parseJson(request, Body);
  if (!parsed.ok) return parsed.response;
  const { mode } = parsed.data;

  const ctx = await getTopicContext(db, topicId);
  if (!ctx) return jsonError(404, "not_found", "Topic not found.");

  const [mastery, lessonRow] = await Promise.all([
    db.maybeOne<{ last_score: number | null }>("select last_score from public.topic_mastery where topic_id = $1", [topicId]),
    db.maybeOne<{ content: unknown }>("select content from public.lessons where topic_id = $1 order by variant desc limit 1", [topicId]),
  ]);
  const lesson = lessonRow ? parseStoredLesson(lessonRow.content) : null;
  const lastScore = mastery?.last_score === null || mastery?.last_score === undefined ? null : Number(mastery.last_score);
  const difficulty = mode === "practice" ? "easier" : mode === "harder" ? "harder" : nextDifficulty(lastScore);

  try {
    const result = await singleFlight(`quiz:${user.id}:${topicId}:${mode}`, async () => {
    const { text: learnerContext, weakConcepts } = await buildLearnerContext(db, user.id, ctx.journey.id);
    const generated = await generateQuiz(
      { db, userId: user.id },
      {
        subject: ctx.journey.subject,
        topicTitle: ctx.topic.title,
        objectives: ctx.topic.objectives,
        recap: lesson?.recap ?? [],
        difficulty,
        count: mode === "practice" ? 4 : 5,
        weakConcepts: mode === "practice" ? weakConcepts : weakConcepts.slice(0, 2),
        learnerContext,
      },
    );
    const assessmentId = await saveAssessment(db, {
      userId: user.id,
      journeyId: ctx.journey.id,
      topicId,
      kind: mode === "practice" ? "practice" : "quiz",
      difficulty,
      quiz: generated.data,
      source: generated.source,
      model: generated.model,
    });
    return { assessmentId, difficulty, source: generated.source };
    });
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
