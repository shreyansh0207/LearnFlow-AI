import { NextResponse } from "next/server";
import { z } from "zod";
import { buildLearnerContext } from "@/lib/ai/context";
import { runLessonAction } from "@/lib/ai/generate";
import { ACTION_LABEL, LESSON_ACTIONS, type LessonAction } from "@/lib/ai/prompts";
import { parseStoredLesson } from "@/lib/ai/schemas";
import { handleRouteError, parseJson } from "@/lib/api";
import { jsonError, requireApiUser } from "@/lib/auth";
import { getTopicContext } from "@/lib/data";
import { isUuid } from "@/lib/utils";

export const maxDuration = 90;

const Body = z.object({ action: z.enum(Object.keys(LESSON_ACTIONS) as [LessonAction, ...LessonAction[]]) });

/** Lesson follow-ups (simpler, another example, Hinglish…). Saved to tutor history so the learner can find them later. */
export async function POST(request: Request, { params }: { params: Promise<{ topicId: string }> }) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) return auth;
  const { db, user } = auth;
  const { topicId } = await params;
  if (!isUuid(topicId)) return jsonError(404, "not_found", "Topic not found.");

  const parsed = await parseJson(request, Body);
  if (!parsed.ok) return parsed.response;
  const { action } = parsed.data;

  const ctx = await getTopicContext(db, topicId);
  if (!ctx) return jsonError(404, "not_found", "Topic not found.");

  const lessonRow = await db.maybeOne<{ content: unknown }>("select content from public.lessons where topic_id = $1 order by variant desc limit 1", [topicId]);
  const lesson = lessonRow ? parseStoredLesson(lessonRow.content) : null;
  const lessonSummary = lesson ? lesson.recap.join("; ") : ctx.topic.summary ?? ctx.topic.title;

  try {
    const { text: learnerContext } = await buildLearnerContext(db, user.id, ctx.journey.id);
    const result = await runLessonAction(
      { db, userId: user.id },
      { action, topicTitle: ctx.topic.title, subject: ctx.journey.subject, lessonSummary, learnerContext },
    );
    await db.query(
      "insert into public.tutor_messages (user_id, journey_id, topic_id, role, content) values ($1, $2, $3, 'user', $4), ($1, $2, $3, 'assistant', $5)",
      [user.id, ctx.journey.id, topicId, `${ACTION_LABEL[action]} — “${ctx.topic.title}”`, result.data],
    );
    return NextResponse.json({ text: result.data, source: result.source });
  } catch (err) {
    return handleRouteError(err);
  }
}
