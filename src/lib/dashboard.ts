import "server-only";
import type { Db } from "@/lib/db";
import { getDueReviewCount, getJourneyOutline, JOURNEY_COLUMNS, nextTopic, type JourneyOutline, type JourneyRow } from "@/lib/data";
import { formatRelative, lastNDays, localDate } from "@/lib/learning/dates";
import { recommendActions, welcomeBackMessage, type NextAction } from "@/lib/learning/recommend";
import { computeStreaks, isMeaningfulDay, type DailyActivityRow, type StreakSummary } from "@/lib/learning/streaks";

export type ActivityRow = DailyActivityRow;

/**
 * "Activities" for the daily target: each completed lesson and quiz counts as one,
 * and every 5 reviews count as one. Stated in the UI so the number is never a mystery.
 */
export function activitiesDone(row: ActivityRow | undefined): number {
  if (!row) return 0;
  return row.lessons_completed + row.quizzes_completed + Math.floor(row.reviews_completed / 5);
}

export async function loadActivity(db: Db): Promise<ActivityRow[]> {
  return db.query<ActivityRow>(
    "select local_date, minutes, lessons_completed, quizzes_completed, reviews_completed from public.daily_activity order by local_date asc limit 3000",
  );
}

export type DashboardData = {
  today: string;
  streak: StreakSummary;
  todayRow: ActivityRow | undefined;
  week: Array<{ date: string; minutes: number; meaningful: boolean }>;
  goals: { minutes_target: number; activities_target: number; days_per_week: number };
  journeys: JourneyRow[];
  outlines: JourneyOutline[];
  focus: JourneyOutline | null;
  dueReviews: number;
  practiceTopic: { id: string; title: string } | null;
  welcome: string | null;
  actions: NextAction[];
  hasHistory: boolean;
};

export async function getDashboard(db: Db, userId: string, timezone: string, displayName: string | null): Promise<DashboardData> {
  const today = localDate(new Date(), timezone);

  const [activity, goals, journeys, dueReviews, practice, lastSession, lastAttempt] = await Promise.all([
    loadActivity(db),
    db.maybeOne<DashboardData["goals"]>("select minutes_target, activities_target, days_per_week from public.daily_goals where user_id = $1", [userId]),
    db.query<JourneyRow>(`select ${JOURNEY_COLUMNS} from public.learning_journeys where status <> 'archived' order by last_studied_at desc nulls last, updated_at desc`),
    getDueReviewCount(db, today),
    db.maybeOne<{ topic_id: string; title: string }>(
      "select m.topic_id, t.title from public.topic_mastery m join public.learning_topics t on t.id = m.topic_id where m.status = 'needs_practice' order by m.updated_at desc limit 1",
    ),
    db.maybeOne<{ completed_at: string; title: string }>(
      "select s.completed_at, t.title from public.lesson_sessions s join public.learning_topics t on t.id = s.topic_id where s.completed_at is not null order by s.completed_at desc limit 1",
    ),
    db.maybeOne<{ score: number; answers: Array<{ correct: boolean; concept: string | null }>; title: string }>(
      "select a.score, a.answers, t.title from public.assessment_attempts a join public.learning_topics t on t.id = a.topic_id order by a.submitted_at desc limit 1",
    ),
  ]);

  const outlines = (await Promise.all(journeys.slice(0, 4).map((j) => getJourneyOutline(db, j.id)))).filter((o): o is JourneyOutline => Boolean(o));
  const focus = outlines.find((o) => o.journey.status === "active" && o.totalCount > 0) ?? outlines.find((o) => o.totalCount > 0) ?? null;

  const meaningful = activity.filter(isMeaningfulDay).map((r) => r.local_date);
  const byDate = new Map(activity.map((r) => [r.local_date, r]));
  const week = lastNDays(today, 7).map((d) => {
    const r = byDate.get(d);
    return { date: d, minutes: r ? Math.round(r.minutes) : 0, meaningful: r ? isMeaningfulDay(r) : false };
  });

  const practiceTopic = practice
    ? { id: practice.topic_id, title: practice.title }
    : null;

  const lastLessonTitle = lastSession?.title;
  const lastQuizTitle = lastAttempt?.title;
  const weakConcepts = (lastAttempt?.answers ?? []).filter((a) => !a.correct && a.concept).map((a) => a.concept!);

  const welcome = welcomeBackMessage({
    name: displayName,
    lastLesson: lastSession && lastLessonTitle ? { title: lastLessonTitle, when: formatRelative(lastSession.completed_at) } : null,
    lastQuiz: lastAttempt && lastQuizTitle ? { topicTitle: lastQuizTitle, score: Number(lastAttempt.score), weakConcepts } : null,
    practiceTopic,
  });

  const next = focus ? nextTopic(focus) : null;
  const actions = recommendActions({
    hasJourney: journeys.length > 0,
    dueReviews,
    practiceTopic,
    nextTopic: next ? { id: next.id, title: next.title } : null,
  });

  return {
    today,
    streak: computeStreaks(meaningful, today),
    todayRow: byDate.get(today),
    week,
    goals: goals ?? { minutes_target: 20, activities_target: 2, days_per_week: 5 },
    journeys,
    outlines,
    focus,
    dueReviews,
    practiceTopic,
    welcome,
    actions,
    hasHistory: activity.length > 0,
  };
}
