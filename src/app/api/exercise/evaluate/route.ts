import { NextResponse } from "next/server";
import { z } from "zod";
import { singleFlight } from "@/lib/ai/client";
import { evaluateExercise } from "@/lib/ai/generate";
import { parseStoredLesson } from "@/lib/ai/schemas";
import { handleRouteError, parseJson } from "@/lib/api";
import { jsonError, requireApiUser } from "@/lib/auth";
import { getTopicContext } from "@/lib/data";

export const maxDuration = 90;

const Body = z.object({
  topicId: z.uuid(),
  answer: z.string().trim().min(10, { message: "Write a little more so your answer can be assessed" }).max(4000),
});

/** Groq feedback on a learner's written exercise answer, judged against the lesson's model answer. */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) return auth;
  const { db, user } = auth;
  const parsed = await parseJson(request, Body);
  if (!parsed.ok) return parsed.response;

  const ctx = await getTopicContext(db, parsed.data.topicId);
  if (!ctx) return jsonError(404, "not_found", "Topic not found.");
  const row = await db.maybeOne<{ content: unknown }>("select content from public.lessons where topic_id = $1 order by variant desc limit 1", [parsed.data.topicId]);
  const lesson = row ? parseStoredLesson(row.content) : null;
  if (!lesson?.exercise.task) return jsonError(409, "no_exercise", "This lesson has no exercise to assess yet.");

  try {
    const result = await singleFlight(`evaluate:${user.id}:${parsed.data.topicId}:${parsed.data.answer.length}:${parsed.data.answer.slice(0, 40)}`, () =>
      evaluateExercise(
        { db, userId: user.id },
        {
          subject: ctx.journey.subject,
          topicTitle: ctx.topic.title,
          objectives: ctx.topic.objectives,
          scenario: lesson.exercise.scenario,
          task: lesson.exercise.task,
          modelAnswer: lesson.exercise.modelAnswer,
          answer: parsed.data.answer,
        },
      ),
    );
    return NextResponse.json({ feedback: result.data, source: result.source });
  } catch (err) {
    return handleRouteError(err);
  }
}
