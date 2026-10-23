import { NextResponse } from "next/server";
import { z } from "zod";
import type { ChatTurn } from "@/lib/ai/client";
import { buildLearnerContext } from "@/lib/ai/context";
import { tutorReply } from "@/lib/ai/generate";
import { handleRouteError, parseJson } from "@/lib/api";
import { jsonError, requireApiUser } from "@/lib/auth";
import { getTopicContext } from "@/lib/data";
import { parseStoredLesson } from "@/lib/ai/schemas";
import { randomUUID } from "node:crypto";
import { recordEvent } from "@/lib/learning/service";

export const maxDuration = 90;

const Body = z.object({
  message: z.string().trim().min(1, { message: "Type a question first" }).max(4000),
  journeyId: z.uuid().nullable().optional(),
  topicId: z.uuid().nullable().optional(),
});

const HISTORY_TURNS = 20;

/**
 * Tutor chat. Messages are saved only after a successful reply, so a provider
 * failure never leaves half a conversation in the learner's history.
 */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) return auth;
  const { db, user, profile } = auth;

  const parsed = await parseJson(request, Body);
  if (!parsed.ok) return parsed.response;
  const { message } = parsed.data;
  let journeyId = parsed.data.journeyId ?? null;
  const topicId = parsed.data.topicId ?? null;

  let topicLine = "";
  if (topicId) {
    const ctx = await getTopicContext(db, topicId);
    if (!ctx) return jsonError(404, "not_found", "Topic not found.");
    journeyId = ctx.journey.id;
    topicLine = `\n- The learner is currently studying the topic “${ctx.topic.title}” (module “${ctx.module.title}”). Objectives: ${ctx.topic.objectives.join("; ") || "—"}.`;
    // Ground follow-up answers in the lesson being read (its key points and defined terms only).
    const lessonRow = await db.maybeOne<{ content: unknown }>("select content from public.lessons where topic_id = $1 order by variant desc limit 1", [topicId]);
    const lesson = lessonRow ? parseStoredLesson(lessonRow.content) : null;
    if (lesson) {
      topicLine += `\n- Current lesson key points: ${lesson.recap.join(" | ")}.`;
      if (lesson.keyTerms.length) topicLine += ` Terms already defined: ${lesson.keyTerms.map((t) => t.term).join(", ")}.`;
    }
  } else if (journeyId) {
    const data = await db.maybeOne("select id from public.learning_journeys where id = $1", [journeyId]);
    if (!data) return jsonError(404, "not_found", "Journey not found.");
  }

  const past = await db.query<ChatTurn>(
    "select role, content from public.tutor_messages where journey_id is not distinct from $1 order by created_at desc limit $2",
    [journeyId, HISTORY_TURNS],
  );
  const history: ChatTurn[] = past.reverse();
  // The API requires the conversation to start with a user turn.
  while (history.length && history[0].role !== "user") history.shift();
  history.push({ role: "user", content: message });

  try {
    const { text: context } = await buildLearnerContext(db, user.id, journeyId);
    const reply = await tutorReply({ db, userId: user.id }, { context: context + topicLine, history });
    await db
      .query("insert into public.tutor_messages (user_id, journey_id, topic_id, role, content) values ($1, $2, $3, 'user', $4), ($1, $2, $3, 'assistant', $5)", [user.id, journeyId, topicId, message, reply.data])
      .catch((e) => console.error("[learnflow] failed to save tutor messages", (e as Error).message));
    await recordEvent(db, profile.timezone, { id: randomUUID(), type: "tutor_message", journeyId, topicId }).catch(() => false);
    return NextResponse.json({ reply: reply.data, source: reply.source });
  } catch (err) {
    return handleRouteError(err);
  }
}
