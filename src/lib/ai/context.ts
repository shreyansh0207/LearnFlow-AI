import "server-only";
import type { Db } from "@/lib/db";
import { STATUS_LABEL, type MasteryStatus } from "@/lib/learning/mastery";

/**
 * Builds a compact, factual description of the learner from saved data only.
 * Deliberately minimal: topic titles, statuses, recent scores and missed concepts.
 * Notes, tutor transcripts, email and other personal data are never included.
 */
export async function buildLearnerContext(db: Db, userId: string, journeyId: string | null): Promise<{ text: string; weakConcepts: string[] }> {
  const lines: string[] = [];

  const [prefs, journey, mastery, attempts, completed] = await Promise.all([
    db.maybeOne<{ learning_styles: string[]; explanation_language: string }>("select learning_styles, explanation_language from public.user_preferences where user_id = $1", [userId]),
    journeyId
      ? db.maybeOne<{ subject: string; goal: string | null; current_level: string; target_level: string }>(
          "select subject, goal, current_level, target_level from public.learning_journeys where id = $1",
          [journeyId],
        )
      : Promise.resolve(null),
    journeyId
      ? db.query<{ status: MasteryStatus; title: string }>(
          `select m.status, t.title from public.topic_mastery m join public.learning_topics t on t.id = m.topic_id
            where m.journey_id = $1 order by m.updated_at desc limit 20`,
          [journeyId],
        )
      : Promise.resolve([]),
    db.query<{ score: number; answers: Array<{ correct: boolean; concept: string | null }> }>(
      "select score, answers from public.assessment_attempts where user_id = $1 order by submitted_at desc limit 8",
      [userId],
    ),
    journeyId
      ? db.query<{ title: string }>(
          `select t.title from public.lesson_sessions s join public.learning_topics t on t.id = s.topic_id
            where s.journey_id = $1 and s.completed_at is not null order by s.completed_at desc limit 8`,
          [journeyId],
        )
      : Promise.resolve([]),
  ]);

  if (journey) {
    lines.push(`Learning ${journey.subject}; started at level "${journey.current_level}", aiming for "${journey.target_level}". Goal: ${journey.goal || "not stated"}.`);
  }
  if (prefs) {
    lines.push(`Prefers: ${prefs.learning_styles.join(", ") || "a mix"}${prefs.explanation_language === "hinglish" ? "; likes Hinglish explanations" : ""}.`);
  }

  const doneTitles = completed.map((d) => d.title);
  lines.push(doneTitles.length ? `Recently completed lessons: ${doneTitles.join("; ")}.` : "Has not completed any lessons in this journey yet.");

  const struggling = mastery.filter((x) => x.status === "needs_practice").map((x) => x.title);
  const strong = mastery.filter((x) => x.status === "proficient" || x.status === "mastered").map((x) => x.title);
  if (struggling.length) lines.push(`Topics needing practice (${STATUS_LABEL.needs_practice.toLowerCase()}): ${struggling.join("; ")}.`);
  if (strong.length) lines.push(`Topics with demonstrated strength: ${strong.join("; ")}.`);

  const counts = new Map<string, number>();
  for (const a of attempts) {
    for (const ans of a.answers ?? []) {
      if (!ans.correct && ans.concept) counts.set(ans.concept, (counts.get(ans.concept) ?? 0) + 1);
    }
  }
  const weakConcepts = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c);
  if (weakConcepts.length) lines.push(`Concepts answered incorrectly in recent quizzes: ${weakConcepts.join("; ")}.`);

  const scores = attempts.map((a) => Math.round(Number(a.score) * 100));
  if (scores.length) lines.push(`Recent quiz scores (newest first): ${scores.join("%, ")}%.`);

  return { text: lines.map((l) => `- ${l}`).join("\n"), weakConcepts };
}
