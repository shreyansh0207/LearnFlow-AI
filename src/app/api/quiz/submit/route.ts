import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, parseJson } from "@/lib/api";
import { jsonError, requireApiUser } from "@/lib/auth";
import { addDays, localDate } from "@/lib/learning/dates";
import { nextDifficulty, scoreSubmission, type AnswerResult, type ScorableQuestion } from "@/lib/learning/scoring";
import { applyQuizToMastery, insertRows, recordEvent } from "@/lib/learning/service";
import { pgCode } from "@/lib/db";

const Body = z.object({
  attemptId: z.uuid(),
  assessmentId: z.uuid(),
  answers: z.record(z.string(), z.number().int().min(0).max(10).nullable()),
});

const MAX_MISTAKE_CARDS = 3;

type StoredAnswer = AnswerResult;

function buildResponse(questions: ScorableQuestion[], answers: StoredAnswer[], extra: Record<string, unknown>) {
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  return {
    results: questions.map((q) => {
      const a = byId.get(q.id);
      return {
        questionId: q.id,
        prompt: q.prompt,
        options: q.options,
        selectedIndex: a?.selectedIndex ?? null,
        correctIndex: q.correct_index,
        correct: a?.correct ?? false,
        explanation: q.explanation,
        concept: q.concept,
      };
    }),
    ...extra,
  };
}

/**
 * Scores a quiz on the server against stored answer keys. The attempt id makes
 * submission idempotent: a retried request returns the original result.
 */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) return auth;
  const { db, user, profile } = auth;

  const parsed = await parseJson(request, Body);
  if (!parsed.ok) return parsed.response;
  const { attemptId, assessmentId, answers } = parsed.data;

  const assessment = await db.maybeOne<{ id: string; journey_id: string; topic_id: string | null; kind: string }>(
    "select id, journey_id, topic_id, kind from public.assessments where id = $1",
    [assessmentId],
  );
  if (!assessment) return jsonError(404, "not_found", "Quiz not found.");
  const questions = await db.query<ScorableQuestion>(
    "select id, prompt, options, correct_index, explanation, concept from public.questions where assessment_id = $1 order by position",
    [assessmentId],
  );
  if (questions.length === 0) return jsonError(409, "empty_quiz", "This quiz has no questions.");

  const existing = await db.maybeOne<{ correct: number; total: number; score: number; answers: StoredAnswer[] }>(
    "select correct, total, score, answers from public.assessment_attempts where id = $1",
    [attemptId],
  );
  if (existing) {
    return NextResponse.json(
      buildResponse(questions, existing.answers as StoredAnswer[], { duplicate: true, correct: existing.correct, total: existing.total, score: Number(existing.score) }),
    );
  }

  try {
    const result = scoreSubmission(questions, answers);
    try {
      await db.query(
        "insert into public.assessment_attempts (id, user_id, assessment_id, journey_id, topic_id, correct, total, score, answers) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [attemptId, user.id, assessmentId, assessment.journey_id, assessment.topic_id, result.correct, result.total, result.score, JSON.stringify(result.answers)],
      );
    } catch (e) {
      // A concurrent duplicate submission won the race; return the stored result.
      if (pgCode(e) === "23505") return NextResponse.json({ duplicate: true, correct: result.correct, total: result.total, score: result.score });
      return jsonError(500, "data_error", "Your answers couldn't be saved. Please try again.");
    }

    let mastery: { mastery: number; status: string } | null = null;
    if (assessment.topic_id && assessment.kind !== "diagnostic") {
      mastery = await applyQuizToMastery(db, user.id, assessment.topic_id, assessment.journey_id, result.score);

      // Turn mistakes into review cards so they come back for spaced revision.
      const wrong = questions.filter((q) => result.answers.find((a) => a.questionId === q.id && !a.correct)).slice(0, MAX_MISTAKE_CARDS);
      if (wrong.length) {
        const existingCards = await db.query<{ front: string }>("select front from public.review_items where topic_id = $1 and kind = 'mistake'", [assessment.topic_id]);
        const seen = new Set(existingCards.map((c) => c.front));
        const due = addDays(localDate(new Date(), profile.timezone), 1);
        const cards = wrong
          .filter((q) => !seen.has(q.prompt))
          .map((q) => [
            user.id,
            assessment.journey_id,
            assessment.topic_id,
            "mistake",
            "system",
            q.prompt.slice(0, 2000),
            `${q.options[q.correct_index]}${q.explanation ? `

${q.explanation}` : ""}`.slice(0, 4000),
            due,
          ]);
        await insertRows(db, "public.review_items", ["user_id", "journey_id", "topic_id", "kind", "source", "front", "back", "due_date"], cards);
      }
    }

    await recordEvent(db, profile.timezone, {
      id: attemptId,
      type: "quiz_submitted",
      journeyId: assessment.journey_id,
      topicId: assessment.topic_id,
      payload: { score: result.score, kind: assessment.kind },
    });

    return NextResponse.json(
      buildResponse(questions, result.answers, {
        correct: result.correct,
        total: result.total,
        score: result.score,
        weakConcepts: result.weakConcepts,
        mastery,
        nextDifficulty: nextDifficulty(result.score),
      }),
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
