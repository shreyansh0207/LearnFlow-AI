import "server-only";
import type { Db } from "@/lib/db";
import type { Quiz } from "@/lib/ai/schemas";
import { DataError, insertRows } from "./service";

/** Saves a generated quiz atomically. Answer keys stay server-side; clients receive questions without them. */
export async function saveAssessment(
  db: Db,
  opts: {
    userId: string;
    journeyId: string;
    topicId: string | null;
    kind: "quiz" | "diagnostic" | "practice";
    difficulty: "easier" | "standard" | "harder";
    quiz: Quiz;
    source: "ai" | "demo";
    model: string | null;
  },
): Promise<string> {
  try {
    return await db.tx(async (tx) => {
      const a = await tx.one<{ id: string }>(
        "insert into public.assessments (user_id, journey_id, topic_id, kind, difficulty, source, model) values ($1, $2, $3, $4, $5, $6, $7) returning id",
        [opts.userId, opts.journeyId, opts.topicId, opts.kind, opts.difficulty, opts.source, opts.model],
      );
      await insertRows(
        tx,
        "public.questions",
        ["assessment_id", "user_id", "position", "prompt", "options", "correct_index", "explanation", "concept"],
        opts.quiz.questions.map((q, i) => [a.id, opts.userId, i, q.prompt, JSON.stringify(q.options), q.correctIndex, q.explanation, q.concept]),
      );
      return a.id;
    });
  } catch (e) {
    console.error("[learnflow] save quiz failed:", (e as Error).message);
    throw new DataError("Could not save the quiz. Please try again.");
  }
}

export type PublicQuestion = { id: string; position: number; prompt: string; options: string[] };

/** Most recent assessment of this kind that hasn't been attempted yet (so a refresh doesn't regenerate). */
export async function findOpenAssessment(db: Db, filter: { topicId?: string; journeyId?: string; kind: string }) {
  const params: unknown[] = [filter.kind];
  let where = "a.kind = $1";
  if (filter.topicId) {
    params.push(filter.topicId);
    where += ` and a.topic_id = $${params.length}`;
  }
  if (filter.journeyId) {
    params.push(filter.journeyId);
    where += ` and a.journey_id = $${params.length}`;
  }
  const a = await db.maybeOne<{ id: string; difficulty: string; source: "ai" | "demo"; attempted: boolean }>(
    `select a.id, a.difficulty, a.source, exists (select 1 from public.assessment_attempts t where t.assessment_id = a.id) as attempted
       from public.assessments a where ${where} order by a.created_at desc limit 1`,
    params,
  );
  if (!a || a.attempted) return null;
  const questions = await db.query<PublicQuestion>("select id, position, prompt, options from public.questions where assessment_id = $1 order by position", [a.id]);
  return { id: a.id, difficulty: a.difficulty, source: a.source, questions };
}
