import type { Metadata } from "next";
import Link from "next/link";
import { ChartLine } from "lucide-react";
import { BarChart, ScoreLineChart } from "@/components/charts";
import { MasteryBadge } from "@/components/mastery-badge";
import { Button, Card, CardTitle, EmptyState, PageHeader, ProgressBar, Select, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { loadActivity } from "@/lib/dashboard";
import { getJourneyOutline, JOURNEY_COLUMNS, type JourneyRow } from "@/lib/data";
import { addDays, lastNDays, localDate, weekdayShort } from "@/lib/learning/dates";
import { STATUS_LABEL, type MasteryStatus } from "@/lib/learning/mastery";
import { computeStreaks, isMeaningfulDay } from "@/lib/learning/streaks";
import { isUuid, pct } from "@/lib/utils";

export const metadata: Metadata = { title: "Progress" };

const RANGES = { "7": 7, "30": 30, "90": 90 } as const;

export default async function ProgressPage({ searchParams }: { searchParams: Promise<{ range?: string; journey?: string }> }) {
  const sp = await searchParams;
  const { db, profile } = await requireUser("/progress");
  const days = RANGES[(sp.range ?? "30") as keyof typeof RANGES] ?? 30;
  const journeyFilter = sp.journey && isUuid(sp.journey) ? sp.journey : null;
  const today = localDate(new Date(), profile.timezone);
  const since = addDays(today, -(days - 1));

  const [activity, attempts, mastery, journeys] = await Promise.all([
    loadActivity(db),
    db.query<{ score: number; submitted_at: string; topic_title: string | null; kind: string }>(
      `select a.score, a.submitted_at, t.title as topic_title, s.kind
         from public.assessment_attempts a
         join public.assessments s on s.id = a.assessment_id
         left join public.learning_topics t on t.id = a.topic_id
        -- One extra day of slack covers timezones ahead of UTC.
        where a.submitted_at >= $1 and ($2::uuid is null or a.journey_id = $2)
        order by a.submitted_at asc limit 200`,
      [`${addDays(since, -1)}T00:00:00Z`, journeyFilter],
    ),
    db.query<{ status: MasteryStatus; mastery: number; topic_id: string; topic_title: string | null }>(
      `select m.status, m.mastery, m.topic_id, t.title as topic_title
         from public.topic_mastery m join public.learning_topics t on t.id = m.topic_id
        where ($1::uuid is null or m.journey_id = $1) order by m.mastery asc`,
      [journeyFilter],
    ),
    db.query<JourneyRow>(`select ${JOURNEY_COLUMNS} from public.learning_journeys where status <> 'archived' order by updated_at desc`),
  ]);
  const outlines = (await Promise.all(journeys.filter((j) => !journeyFilter || j.id === journeyFilter).map((j) => getJourneyOutline(db, j.id)))).filter((o) => o !== null);

  const byDate = new Map(activity.map((r) => [r.local_date, r]));
  const rangeDays = lastNDays(today, days);
  const inRange = activity.filter((r) => r.local_date >= since);
  // Activity rows are account-wide; the journey filter applies to quizzes, mastery and modules.
  const totalMinutes = Math.round(inRange.reduce((s, r) => s + r.minutes, 0));
  const lessons = inRange.reduce((s, r) => s + r.lessons_completed, 0);
  const reviews = inRange.reduce((s, r) => s + r.reviews_completed, 0);
  const streak = computeStreaks(activity.filter(isMeaningfulDay).map((r) => r.local_date), today);

  const studyBars = rangeDays.map((d) => {
    const m = Math.round(byDate.get(d)?.minutes ?? 0);
    return { label: d, sublabel: days <= 7 ? weekdayShort(d) : d.slice(5), value: m, display: `${m} min` };
  });

  const quizAttempts = attempts.filter((a) => a.kind !== "diagnostic");
  const scorePoints = quizAttempts.map((a) => ({
    label: `${a.topic_title ?? "Quiz"} · ${a.submitted_at.slice(0, 10)}`,
    value: Number(a.score),
    display: pct(Number(a.score)),
  }));
  const avgScore = quizAttempts.length ? quizAttempts.reduce((s, a) => s + Number(a.score), 0) / quizAttempts.length : null;

  const statusCounts = mastery.reduce<Record<string, number>>((acc, m) => ((acc[m.status] = (acc[m.status] ?? 0) + 1), acc), {});
  const needsRevision = mastery.filter((m) => m.status === "needs_practice" || m.status === "developing").slice(0, 8);
  const totalTopics = outlines.reduce((s, o) => s + o.totalCount, 0);
  const studied = outlines.reduce((s, o) => s + o.completedCount, 0);
  const demonstrated = mastery.filter((m) => m.status === "proficient" || m.status === "mastered").length;

  const qs = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const merged = { range: String(days), journey: journeyFilter, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/progress?${p.toString()}`;
  };

  if (activity.length === 0 && quizAttempts.length === 0) {
    return (
      <div>
        <PageHeader title="Progress" />
        <EmptyState icon={<ChartLine className="size-6" />} title="No learning data yet" description="Complete a lesson or a quiz and your progress will appear here — built only from what you've actually done." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Progress" description="Built only from your real activity. Studying, assessment results and demonstrated mastery are shown separately." />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl bg-surface-2 p-1" role="group" aria-label="Date range">
          {Object.keys(RANGES).map((r) => (
            <Link key={r} href={qs({ range: r })} aria-current={String(days) === r ? "true" : undefined} className={`rounded-lg px-3 py-1.5 text-sm ${String(days) === r ? "bg-surface font-medium shadow-sm" : "text-muted"}`}>
              {r} days
            </Link>
          ))}
        </div>
        <form action="/progress" className="flex items-center gap-2">
          <input type="hidden" name="range" value={days} />
          <Select name="journey" defaultValue={journeyFilter ?? ""} aria-label="Journey" className="h-10 w-auto max-w-60">
            <option value="">All journeys</option>
            {journeys.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </Select>
          <Button type="submit" size="sm" variant="secondary">Apply</Button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Study time (${days}d)`} value={`${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`} sub="Time alone doesn't prove understanding" />
        <Stat label={`Lessons studied (${days}d)`} value={lessons} sub={`${reviews} reviews done`} />
        <Stat label="Average quiz score" value={pct(avgScore)} sub={`${quizAttempts.length} quizzes in range`} />
        <Stat label="Streak" value={`${streak.current} d`} sub={`Longest: ${streak.longest} d`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Study time per day</CardTitle>
          <p className="mb-6 text-xs text-muted">Minutes of active lesson time (all journeys)</p>
          <BarChart data={studyBars} ariaLabel={`Study minutes per day over the last ${days} days`} unit="min" />
        </Card>
        <Card>
          <CardTitle>Quiz scores</CardTitle>
          <p className="mb-6 text-xs text-muted">Each point is one quiz attempt, oldest to newest</p>
          {scorePoints.length ? <ScoreLineChart points={scorePoints} ariaLabel="Quiz score per attempt" /> : <p className="py-10 text-center text-sm text-muted">No quizzes in this range.</p>}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardTitle>Completed vs. demonstrated</CardTitle>
          <div className="mt-4 space-y-4 text-sm">
            <div>
              <div className="mb-1 flex justify-between"><span>Lessons studied</span><span className="tabular-nums text-muted">{studied}/{totalTopics}</span></div>
              <ProgressBar value={totalTopics ? studied / totalTopics : 0} label="Lessons studied" />
            </div>
            <div>
              <div className="mb-1 flex justify-between"><span>Topics with demonstrated mastery</span><span className="tabular-nums text-muted">{demonstrated}/{totalTopics}</span></div>
              <ProgressBar value={totalTopics ? demonstrated / totalTopics : 0} label="Demonstrated mastery" tone="accent" />
            </div>
          </div>
          <ul className="mt-5 grid grid-cols-2 gap-2 text-xs">
            {(Object.keys(STATUS_LABEL) as MasteryStatus[]).filter((s) => s !== "not_started").map((s) => (
              <li key={s} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-2.5 py-2">
                <MasteryBadge status={s} />
                <span className="tabular-nums font-medium">{statusCounts[s] ?? 0}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Mastery = 60% quiz results, 25% review recall, 15% self-rated confidence (when available), with recent results weighted more.</p>
        </Card>
        <Card>
          <CardTitle>Topics needing revision</CardTitle>
          {needsRevision.length ? (
            <ul className="mt-3 divide-y divide-border">
              {needsRevision.map((m) => (
                <li key={m.topic_id} className="flex items-center justify-between gap-2 py-2.5">
                  <Link href={`/lesson/${m.topic_id}`} className="min-w-0 truncate text-sm font-medium hover:text-primary">{m.topic_title}</Link>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-xs tabular-nums text-muted">{pct(Number(m.mastery))}</span>
                    <MasteryBadge status={m.status} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">Nothing flagged. Topics appear here when quiz or review results show they need work.</p>
          )}
        </Card>
      </div>

      {outlines.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold">Module completion</h2>
          <div className="space-y-3">
            {outlines.map((o) => (
              <Card key={o.journey.id}>
                <Link href={`/journeys/${o.journey.id}`} className="font-medium hover:text-primary">{o.journey.title}</Link>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {o.modules.map((m, i) => {
                    const done = m.topics.filter((t) => t.mastery?.lesson_completed_at).length;
                    return (
                      <div key={m.id}>
                        <div className="mb-1 flex justify-between gap-2 text-xs">
                          <span className="truncate">{i + 1}. {m.title}</span>
                          <span className="shrink-0 tabular-nums text-muted">{done}/{m.topics.length}</span>
                        </div>
                        <ProgressBar value={m.topics.length ? done / m.topics.length : 0} label={`${m.title} completion`} />
                      </div>
                    );
                  })}
                </div>
                {o.modules.find((m) => m.topics.some((t) => !t.mastery?.lesson_completed_at))?.milestone && (
                  <p className="mt-3 text-xs text-muted">
                    <span className="font-medium text-ink">Next milestone:</span> {o.modules.find((m) => m.topics.some((t) => !t.mastery?.lesson_completed_at))?.milestone}
                  </p>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
