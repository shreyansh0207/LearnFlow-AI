import { NextResponse } from "next/server";
import { AIError, singleFlight } from "@/lib/ai/client";
import { InvalidAIOutputError } from "@/lib/ai/schemas";
import { handleRouteError, parseJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { isValidTimeZone } from "@/lib/learning/dates";
import { buildCurriculum } from "@/lib/curriculum/build";
import { JOURNEY_COLUMNS, type JourneyRow } from "@/lib/data";
import { JourneyInputSchema } from "@/lib/validation";

export const maxDuration = 120;

/**
 * Creates a journey and generates its curriculum. The journey row is saved first,
 * so an AI failure never loses the learner's answers: the roadmap page offers a retry.
 */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) return auth;
  const { db, user } = auth;

  const parsed = await parseJson(request, JourneyInputSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  // Link to the catalog only if the node is real and visible to this user.
  let nodeId: string | null = null;
  if (input.knowledgeNodeId) {
    const node = await db.maybeOne<{ id: string }>("select id from public.knowledge_nodes where id = $1", [input.knowledgeNodeId]);
    nodeId = node?.id ?? null;
  }

  // A retried submission with the same request id joins the in-flight one instead of creating a duplicate.
  const key = `journey:${user.id}:${input.requestId ?? crypto.randomUUID()}`;
  return singleFlight(key, () => createJourney()).then((r) => NextResponse.json(r.body, { status: r.status }));

  async function createJourney(): Promise<{ body: unknown; status: number }> {
  let journey: { id: string };
  try {
    journey = await db.one<{ id: string }>(
      `insert into public.learning_journeys (user_id, title, subject, goal, motivation, current_level, target_level, minutes_per_day, days_per_week, learning_styles, deadline, status, knowledge_node_id, learning_pattern, scope_notes)
       values ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'draft', $11, $12, $13) returning id`,
      [user.id, input.subject, input.goal, input.motivation, input.currentLevel, input.targetLevel, input.minutesPerDay, input.daysPerWeek, input.learningStyles, input.deadline, nodeId, input.learningPattern ?? null, input.scopeNotes],
    );
  } catch {
    return { body: { error: { code: "data_error", message: "Could not save your journey. Please try again." } }, status: 500 };
  }

  if (input.onboarding) {
    const tz = input.timezone && isValidTimeZone(input.timezone) ? input.timezone : undefined;
    await db.tx(async (tx) => {
      await tx.query("update public.profiles set onboarded_at = now(), timezone = coalesce($1, timezone) where id = $2", [tz ?? null, user.id]);
      await tx.query("update public.daily_goals set minutes_target = $1, days_per_week = $2 where user_id = $3", [input.minutesPerDay, input.daysPerWeek, user.id]);
      if (input.learningStyles.length) await tx.query("update public.user_preferences set learning_styles = $1 where user_id = $2", [input.learningStyles, user.id]);
    });
  }

  try {
    const row = await db.one<JourneyRow & { knowledge_node_id: string | null; learning_pattern: string | null; scope_notes: string | null }>(
      `select ${JOURNEY_COLUMNS}, knowledge_node_id, learning_pattern, scope_notes from public.learning_journeys where id = $1`,
      [journey.id],
    );
    const result = await buildCurriculum(db, user.id, row);
    return { body: { journeyId: journey.id, source: result.source }, status: 201 };
  } catch (err) {
    if (err instanceof AIError || err instanceof InvalidAIOutputError) {
      const message = err instanceof AIError ? err.message : "Groq returned a roadmap that didn't pass validation, so nothing was saved. Please try again.";
      return { body: { journeyId: journey.id, curriculumError: { code: err instanceof AIError ? err.code : "invalid_output", message } }, status: 201 };
    }
    const r = handleRouteError(err);
    return { body: await r.json(), status: r.status };
  }
  }
}
