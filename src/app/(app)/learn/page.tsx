import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getJourneyOutline, nextTopic } from "@/lib/data";

/**
 * "Learn" resumes from the learner's actual last position: the last opened topic
 * if it isn't finished yet, otherwise the next unfinished topic in that journey.
 */
export default async function LearnPage() {
  const { db } = await requireUser("/learn");
  const journeys = await db.query<{ id: string; last_topic_id: string | null }>(
    `select id, last_topic_id from public.learning_journeys
      where status in ('active', 'draft') and active_version_id is not null
      order by last_studied_at desc nulls last, updated_at desc limit 3`,
  );

  for (const j of journeys) {
    const outline = await getJourneyOutline(db, j.id);
    if (!outline) continue;
    const last = outline.flatTopics.find((t) => t.id === j.last_topic_id);
    if (last && !last.lessonCompleted) redirect(`/lesson/${last.id}`);
    const next = nextTopic(outline);
    if (next) redirect(`/lesson/${next.id}`);
  }
  redirect(journeys.length ? "/learning?allDone=1" : "/journeys/new");
}
