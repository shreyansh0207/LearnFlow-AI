import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BookOpen, CircleCheck, Clock, Flame, Plus, RotateCcw, Search, Sparkles, Target, Trophy } from "lucide-react";
import { InstallButton } from "@/components/pwa/install";
import { Alert, ButtonLink, Card, CardTitle, ProgressBar, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { activitiesDone, getDashboard } from "@/lib/dashboard";
import { weekdayShort } from "@/lib/learning/dates";
import type { NextAction } from "@/lib/learning/recommend";
import { STREAK_DEFINITION } from "@/lib/learning/streaks";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Home" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ passwordUpdated?: string }> }) {
  const sp = await searchParams;
  const { db, user, profile } = await requireUser("/dashboard");
  const d = await getDashboard(db, user.id, profile.timezone, profile.display_name);

  if (d.journeys.length === 0 && !profile.onboarded_at) redirect("/onboarding");

  const minutesToday = Math.round(d.todayRow?.minutes ?? 0);
  const doneToday = activitiesDone(d.todayRow);
  const greetingName = profile.display_name ? `, ${profile.display_name}` : "";
  const primary = d.actions[0];

  return (
    <div className="space-y-6">
      {sp.passwordUpdated && <Alert kind="success">Your password has been updated.</Alert>}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: profile.timezone })}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{d.hasHistory ? `Good to see you${greetingName}` : `Welcome${greetingName}`}</h1>
        </div>
        <InstallButton className="lg:hidden" />
      </div>

      <form action="/explore" role="search" className="relative">
        <label htmlFor="dash-explore" className="sr-only">
          What do you want to learn?
        </label>
        <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
        <input
          id="dash-explore"
          name="q"
          required
          minLength={2}
          maxLength={200}
          placeholder="What do you want to learn? Any subject, skill or question…"
          className="h-13 w-full rounded-2xl border border-border bg-surface pl-12 pr-4 text-[16px] shadow-sm placeholder:text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
        />
      </form>

      {/* Welcome back / new user */}
      <Card className="brand-gradient relative overflow-hidden border-0 text-white">
        <div className="relative">
          {d.welcome ? (
            <p className="max-w-2xl text-[15px] leading-relaxed text-white/95">{d.welcome}</p>
          ) : d.journeys.length ? (
            <p className="max-w-2xl text-[15px] leading-relaxed text-white/95">Your roadmap is ready. Start your first lesson — it takes about {d.focus?.flatTopics[0]?.estimatedMinutes ?? 15} minutes.</p>
          ) : (
            <p className="max-w-2xl text-[15px] leading-relaxed text-white/95">Let&apos;s build your first learning journey. Pick any subject and LearnFlow designs a roadmap from zero.</p>
          )}
          {d.streak.current === 0 && d.streak.longest > 0 && (
            <p className="mt-2 text-sm text-white/80">Every day is a fresh start — your best streak so far was {d.streak.longest} days.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {primary.kind === "practice" && <ButtonLink href={`/lesson/${primary.topicId}?variant=simpler`} variant="secondary" className="border-0">Revise “{truncate(primary.title, 28)}” <ArrowRight aria-hidden className="size-4" /></ButtonLink>}
            {primary.kind === "review" && <ButtonLink href="/review" variant="secondary" className="border-0">Start {primary.count} reviews <ArrowRight aria-hidden className="size-4" /></ButtonLink>}
            {primary.kind === "lesson" && <ButtonLink href={`/lesson/${primary.topicId}`} variant="secondary" className="border-0">{d.hasHistory ? "Continue" : "Start"}: {truncate(primary.title, 28)} <ArrowRight aria-hidden className="size-4" /></ButtonLink>}
            {primary.kind === "create" && <ButtonLink href="/journeys/new" variant="secondary" className="border-0"><Plus aria-hidden className="size-4" /> Create a journey</ButtonLink>}
            {primary.kind === "done" && <ButtonLink href="/journeys/new" variant="secondary" className="border-0"><Sparkles aria-hidden className="size-4" /> Start a new journey</ButtonLink>}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Current streak" icon={<Flame aria-hidden className="size-3.5 text-warn" />} value={`${d.streak.current} ${d.streak.current === 1 ? "day" : "days"}`} sub={d.streak.atRisk ? "Learn today to keep it going" : d.streak.todayCounts ? "Today counts ✓" : "Start one today"} />
        <Stat label="Longest streak" icon={<Trophy aria-hidden className="size-3.5 text-accent" />} value={`${d.streak.longest} ${d.streak.longest === 1 ? "day" : "days"}`} />
        <Stat label="Study time today" icon={<Clock aria-hidden className="size-3.5 text-primary" />} value={`${minutesToday} min`} sub={`Goal: ${d.goals.minutes_target} min`} />
        <Stat label="Reviews due" icon={<RotateCcw aria-hidden className="size-3.5 text-primary" />} value={d.dueReviews} sub={d.dueReviews ? <Link href="/review" className="text-primary">Review now →</Link> : "All caught up"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Target aria-hidden className="size-4 text-primary" /> Today&apos;s plan</CardTitle>
            <span className="text-xs text-muted tabular-nums">{Math.min(doneToday, d.goals.activities_target)}/{d.goals.activities_target} activities</span>
          </div>
          <ProgressBar value={doneToday / d.goals.activities_target} label="Daily activities" className="mt-3" />
          <ul className="mt-4 space-y-2">
            {d.actions.map((a, i) => (
              <li key={i}>
                <PlanItem action={a} />
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-surface-2 p-3 text-center text-xs text-muted">
            <div><p className="text-base font-semibold tabular-nums text-ink">{d.todayRow?.lessons_completed ?? 0}</p>lessons</div>
            <div><p className="text-base font-semibold tabular-nums text-ink">{d.todayRow?.quizzes_completed ?? 0}</p>quizzes</div>
            <div><p className="text-base font-semibold tabular-nums text-ink">{d.todayRow?.reviews_completed ?? 0}</p>reviews</div>
          </div>
          <p className="mt-3 text-xs text-muted">Each lesson or quiz counts as one activity; every 5 reviews count as one.</p>
        </Card>

        <Card>
          <CardTitle>This week</CardTitle>
          <ol className="mt-4 grid grid-cols-7 gap-1.5" aria-label="Learning days this week">
            {d.week.map((day) => (
              <li key={day.date} className="flex flex-col items-center gap-1.5">
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full text-xs font-medium",
                    day.meaningful ? "bg-primary text-primary-ink" : day.minutes > 0 ? "bg-primary-soft text-primary" : "bg-surface-2 text-muted",
                    day.date === d.today && "ring-2 ring-primary ring-offset-2 ring-offset-surface",
                  )}
                  aria-label={`${weekdayShort(day.date)}: ${day.meaningful ? "learning day" : day.minutes > 0 ? `${day.minutes} minutes, not yet a learning day` : "no activity"}`}
                >
                  {day.meaningful ? <CircleCheck aria-hidden className="size-4" /> : weekdayShort(day.date).slice(0, 1)}
                </span>
                <span className="text-[10px] text-muted">{weekdayShort(day.date)}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm">
            <span className="font-semibold tabular-nums">{d.week.filter((w) => w.meaningful).length}</span>
            <span className="text-muted"> of {d.goals.days_per_week} planned learning days</span>
          </p>
          <ProgressBar value={d.week.filter((w) => w.meaningful).length / d.goals.days_per_week} label="Weekly goal" className="mt-2" />
          <p className="mt-3 text-xs text-muted">{STREAK_DEFINITION}</p>
        </Card>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Your journeys</h2>
          <Link href="/journeys/new" className="flex items-center gap-1 text-sm font-medium text-primary"><Plus aria-hidden className="size-4" /> New</Link>
        </div>
        {d.outlines.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {d.outlines.map((o) => (
              <Link key={o.journey.id} href={`/journeys/${o.journey.id}`} className="block rounded-2xl focus-visible:outline-offset-4">
                <Card className="h-full transition-colors hover:border-primary/40">
                  <div className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"><BookOpen aria-hidden className="size-5" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{o.journey.title}</p>
                      <p className="text-xs capitalize text-muted">{o.journey.status} · {o.completedCount}/{o.totalCount} lessons studied</p>
                    </div>
                  </div>
                  <ProgressBar value={o.totalCount ? o.completedCount / o.totalCount : 0} label={`${o.journey.title} progress`} className="mt-4" />
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="text-center text-sm text-muted">
            No journeys yet. <Link href="/journeys/new" className="font-medium text-primary">Create your first one →</Link>
          </Card>
        )}
      </section>
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function PlanItem({ action }: { action: NextAction }) {
  const href =
    action.kind === "practice" ? `/quiz/${action.topicId}?mode=practice` : action.kind === "review" ? "/review" : action.kind === "lesson" ? `/lesson/${action.topicId}` : "/journeys/new";
  const title =
    action.kind === "practice" ? `Practise “${action.title}”` : action.kind === "review" ? `Review ${action.count} card${action.count === 1 ? "" : "s"}` : action.kind === "lesson" ? action.title : action.kind === "create" ? "Create a learning journey" : "Start a new journey";
  return (
    <Link href={href} className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:border-primary/40 hover:bg-surface-2">
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", action.kind === "practice" ? "bg-warn-soft text-warn" : action.kind === "review" ? "bg-accent-soft text-accent" : "bg-primary-soft text-primary")}>
        {action.kind === "review" ? <RotateCcw aria-hidden className="size-4" /> : action.kind === "practice" ? <Target aria-hidden className="size-4" /> : <BookOpen aria-hidden className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted">{action.reason}</span>
      </span>
      <ArrowRight aria-hidden className="size-4 shrink-0 text-muted" />
    </Link>
  );
}
