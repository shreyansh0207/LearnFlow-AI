import { NextResponse } from "next/server";
import { singleFlight } from "@/lib/ai/client";
import { recommendRevision } from "@/lib/ai/generate";
import { handleRouteError } from "@/lib/api";
import { jsonError, requireApiUser } from "@/lib/auth";
import { localDate } from "@/lib/learning/dates";

export const maxDuration = 90;

/**
 * AI revision recommendations built from minimal study data only: topic titles,
 * mastery status, last scores, due-card counts and recently missed concepts.
 * The response may only name topics from that list.
 */
export async function POST() {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) return auth;
  const { db, user, profile } = auth;
  const today = localDate(new Date(), profile.timezone);

  const [topics, attempts] = await Promise.all([
    db.query<{ title: string; status: string; mastery: number; last_score: number | null; due: number }>(
      `select t.title, m.status, m.mastery, m.last_score,
              (select count(*)::int from public.review_items r where r.topic_id = t.id and not r.suspended and r.due_date <= $1) as due
         from public.topic_mastery m join public.learning_topics t on t.id = m.topic_id
        where m.lesson_completed_at is not null or m.quiz_attempts > 0
        order by m.mastery asc, m.updated_at desc limit 25`,
      [today],
    ),
    db.query<{ answers: Array<{ correct: boolean; concept: string | null }> }>("select answers from public.assessment_attempts order by submitted_at desc limit 8"),
  ]);
  if (topics.length === 0) return jsonError(409, "no_history", "Study a lesson or take a quiz first — the plan is built only from your real progress.");

  const missed = [...new Set(attempts.flatMap((a) => (a.answers ?? []).filter((x) => !x.correct && x.concept).map((x) => x.concept!)))].slice(0, 10);
  const data = [
    "Topics (title | status | mastery | last quiz | review cards due):",
    ...topics.map((t) => `- ${t.title} | ${t.status} | ${Math.round(t.mastery * 100)}% | ${t.last_score === null ? "no quiz" : `${Math.round(t.last_score * 100)}%`} | ${t.due}`),
    missed.length ? `Recently missed concepts: ${missed.join("; ")}` : "No recent quiz mistakes.",
  ].join("\n");

  try {
    const result = await singleFlight(`revision:${user.id}`, () => recommendRevision({ db, userId: user.id }, { data, topics: topics.map((t) => t.title) }));
    return NextResponse.json({ plan: result.data, source: result.source });
  } catch (err) {
    return handleRouteError(err);
  }
}
