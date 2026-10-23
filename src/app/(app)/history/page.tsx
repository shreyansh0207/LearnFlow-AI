import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, CircleCheck, History, ListChecks, MessageCircle, RotateCcw } from "lucide-react";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { pct } from "@/lib/utils";

export const metadata: Metadata = { title: "Learning history" };

const PAGE_SIZE = 40;

const META: Record<string, { label: string; icon: typeof BookOpen }> = {
  lesson_started: { label: "Opened lesson", icon: BookOpen },
  lesson_completed: { label: "Completed lesson", icon: CircleCheck },
  quiz_submitted: { label: "Quiz submitted", icon: ListChecks },
  review_completed: { label: "Reviewed a card", icon: RotateCcw },
  tutor_message: { label: "Asked the tutor", icon: MessageCircle },
  study_time: { label: "Study time", icon: BookOpen },
};

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ page?: string; type?: string }> }) {
  const sp = await searchParams;
  const { db, profile } = await requireUser("/history");
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const type = sp.type && sp.type in META ? sp.type : null;

  // Lesson opens are noise in the default view; they're shown only when filtered for explicitly.
  const filter = type ? "e.event_type = $1" : "e.event_type <> $1";
  const filterValue = type ?? "lesson_started";
  type EventRow = { id: string; event_type: string; occurred_at: string; minutes: number; payload: Record<string, unknown>; topic_id: string | null; topic_title: string | null; journey_title: string | null };
  const [data, count] = await Promise.all([
    db.query<EventRow>(
      `select e.id, e.event_type, e.occurred_at, e.minutes, e.payload, e.topic_id, t.title as topic_title, j.title as journey_title
         from public.learning_events e
         left join public.learning_topics t on t.id = e.topic_id
         left join public.learning_journeys j on j.id = e.journey_id
        where ${filter} order by e.occurred_at desc limit $2 offset $3`,
      [filterValue, PAGE_SIZE, (page - 1) * PAGE_SIZE],
    ),
    db.count(`select count(*)::int as count from public.learning_events e where ${filter}`, [filterValue]),
  ]);
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  // Group by the learner's local day.
  const groups = new Map<string, typeof data>();
  for (const e of data) {
    const day = new Date(e.occurred_at).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric", timeZone: profile.timezone });
    groups.set(day, [...(groups.get(day) ?? []), e]);
  }

  const link = (p: number, t: string | null = type) => {
    const params = new URLSearchParams();
    if (t) params.set("type", t);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return `/history${s ? `?${s}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Learning history" description="A record of everything you've done, newest first." />
      <nav aria-label="Filter history" className="mb-5 flex flex-wrap gap-2 text-sm">
        {[
          [null, "All"],
          ["lesson_completed", "Lessons"],
          ["quiz_submitted", "Quizzes"],
          ["review_completed", "Reviews"],
          ["tutor_message", "Tutor"],
        ].map(([t, label]) => (
          <Link key={label} href={link(1, t)} aria-current={type === t ? "true" : undefined} className={`rounded-full border px-3 py-1.5 ${type === t ? "border-primary bg-primary-soft text-primary" : "border-border text-muted"}`}>
            {label}
          </Link>
        ))}
      </nav>
      {groups.size === 0 ? (
        <EmptyState icon={<History className="size-6" />} title="No history yet" description="Your lessons, quizzes and reviews will be recorded here." />
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([day, events]) => (
            <section key={day}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{day}</h2>
              <Card className="divide-y divide-border p-0">
                {events.map((e) => {
                  const meta = META[e.event_type] ?? META.study_time;
                  const Icon = meta.icon;
                  const payload = (e.payload ?? {}) as { score?: number; rating?: string; confidence?: number | null; kind?: string };
                  const topicTitle = e.topic_title;
                  const journeyTitle = e.journey_title;
                  return (
                    <div key={e.id} className="flex items-start gap-3 px-4 py-3">
                      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">
                          <span className="font-medium">{e.event_type === "quiz_submitted" && payload.kind === "diagnostic" ? "Diagnostic" : meta.label}</span>
                          {topicTitle && (
                            <>
                              {" · "}
                              {e.topic_id ? <Link href={`/lesson/${e.topic_id}`} className="hover:text-primary">{topicTitle}</Link> : topicTitle}
                            </>
                          )}
                        </p>
                        <p className="text-xs text-muted">
                          {new Date(e.occurred_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: profile.timezone })}
                          {journeyTitle && ` · ${journeyTitle}`}
                          {typeof payload.score === "number" && ` · score ${pct(payload.score)}`}
                          {payload.rating && ` · rated “${payload.rating}”`}
                          {Number(e.minutes) > 0 && ` · ${Math.round(Number(e.minutes))} min`}
                          {payload.confidence ? ` · confidence ${payload.confidence}/5` : ""}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </Card>
            </section>
          ))}
        </div>
      )}
      {totalPages > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-4 text-sm">
          {page > 1 ? <Link href={link(page - 1)} className="text-primary">← Newer</Link> : <span className="text-muted">← Newer</span>}
          <span className="text-muted">Page {page} of {totalPages}</span>
          {page < totalPages ? <Link href={link(page + 1)} className="text-primary">Older →</Link> : <span className="text-muted">Older →</span>}
        </nav>
      )}
    </div>
  );
}
