import type { Metadata } from "next";
import { RotateCcw } from "lucide-react";
import { RevisionPlanCard } from "@/components/ai-tools";
import { ReviewSession, type ReviewCard } from "@/components/review-session";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { addDays, localDate } from "@/lib/learning/dates";

export const metadata: Metadata = { title: "Daily review" };

export default async function ReviewPage() {
  const { db, profile } = await requireUser("/review");
  const today = localDate(new Date(), profile.timezone);
  const prefs = await db.maybeOne<{ max_daily_reviews: number }>("select max_daily_reviews from public.user_preferences limit 1");
  const limit = prefs?.max_daily_reviews ?? 20;

  type DueRow = Omit<ReviewCard, "topicTitle" | "topicId"> & { topic_id: string | null; topic_title: string | null };
  const [due, count, upcoming] = await Promise.all([
    db.query<DueRow>(
      `select r.id, r.kind, r.front, r.back, r.interval_days, r.ease, r.repetitions, r.lapses, r.due_date, r.topic_id, t.title as topic_title
         from public.review_items r left join public.learning_topics t on t.id = r.topic_id
        where not r.suspended and r.due_date <= $1
        order by r.due_date asc, r.created_at asc limit $2`,
      [today, limit],
    ),
    db.count("select count(*)::int as count from public.review_items where not suspended and due_date <= $1", [today]),
    db.maybeOne<{ due_date: string }>("select due_date from public.review_items where not suspended and due_date > $1 order by due_date limit 1", [today]),
  ]);

  const cards: ReviewCard[] = due.map((r) => ({
    id: r.id,
    kind: r.kind,
    front: r.front,
    back: r.back,
    interval_days: r.interval_days,
    ease: Number(r.ease),
    repetitions: r.repetitions,
    lapses: r.lapses,
    due_date: r.due_date,
    topicId: r.topic_id,
    topicTitle: r.topic_title,
  }));
  const overflow = Math.max(0, count - cards.length);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Daily review"
        description={cards.length ? `${cards.length} card${cards.length === 1 ? "" : "s"} due today${overflow ? ` (capped at your daily limit of ${limit})` : ""}.` : "Spaced repetition keeps what you learned from fading."}
      />
      {cards.length ? (
        <ReviewSession cards={cards} today={today} overflow={overflow} />
      ) : (
        <EmptyState
          icon={<RotateCcw className="size-6" />}
          title="Nothing due right now"
          description={
            upcoming
              ? `Your next review is due ${upcoming.due_date === addDays(today, 1) ? "tomorrow" : `on ${upcoming.due_date}`}. Complete lessons and quizzes to add cards.`
              : "Complete a lesson to create your first review cards."
          }
          action={<ButtonLink href="/learn">Continue learning</ButtonLink>}
        />
      )}
      <div className="mt-6">
        <RevisionPlanCard />
      </div>
    </div>
  );
}
