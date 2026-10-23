import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Plus } from "lucide-react";
import { Alert, Badge, ButtonLink, Card, EmptyState, PageHeader, ProgressBar } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatRelative } from "@/lib/learning/dates";

export const metadata: Metadata = { title: "My Learning" };

type Row = {
  id: string;
  title: string;
  subject: string;
  status: string;
  last_studied_at: string | null;
  active_version_id: string | null;
  created_at: string;
};

export default async function MyLearningPage({ searchParams }: { searchParams: Promise<{ deleted?: string; allDone?: string; show?: string }> }) {
  const sp = await searchParams;
  const { db } = await requireUser("/learning");
  const showArchived = sp.show === "archived";

  const journeys = await db.query<Row & { done: number; total: number }>(
    `select j.id, j.title, j.subject, j.status, j.last_studied_at, j.active_version_id, j.created_at,
            (select count(*)::int from public.learning_topics t where t.version_id = j.active_version_id) as total,
            (select count(*)::int from public.learning_topics t join public.topic_mastery m on m.topic_id = t.id
              where t.version_id = j.active_version_id and m.lesson_completed_at is not null) as done
       from public.learning_journeys j
      where (j.status = 'archived') = $1
      order by j.last_studied_at desc nulls last, j.created_at desc`,
    [showArchived],
  );
  // Progress per journey: topics in the active version vs. topics with a completed lesson.
  const progress = new Map(journeys.filter((j) => j.active_version_id).map((j) => [j.active_version_id!, { done: j.done, total: j.total }]));

  return (
    <div>
      <PageHeader
        title="My Learning"
        description="All your learning journeys in one place."
        action={
          <ButtonLink href="/journeys/new">
            <Plus aria-hidden className="size-4" /> New journey
          </ButtonLink>
        }
      />
      {sp.deleted && <Alert kind="success" className="mb-4">The journey was deleted.</Alert>}
      {sp.allDone && <Alert kind="success" className="mb-4">You&apos;ve studied every lesson in your active journeys. Keep up your reviews, or start something new!</Alert>}

      <div className="mb-4 flex gap-2 text-sm">
        <Link href="/learning" className={!showArchived ? "font-medium text-primary" : "text-muted"}>Current</Link>
        <span className="text-border">|</span>
        <Link href="/learning?show=archived" className={showArchived ? "font-medium text-primary" : "text-muted"}>Archived</Link>
      </div>

      {journeys.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {journeys.map((j) => {
            const p = j.active_version_id ? progress.get(j.active_version_id) : undefined;
            return (
              <Link key={j.id} href={`/journeys/${j.id}`} className="block rounded-2xl focus-visible:outline-offset-4">
                <Card className="h-full transition-colors hover:border-primary/40">
                  <div className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                      <BookOpen aria-hidden className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-semibold">{j.title}</p>
                      </div>
                      <p className="truncate text-xs text-muted">{j.subject}</p>
                    </div>
                    <Badge tone={j.status === "active" ? "success" : j.status === "draft" ? "accent" : "neutral"} className="capitalize">{j.status}</Badge>
                  </div>
                  {p ? (
                    <>
                      <ProgressBar value={p.total ? p.done / p.total : 0} label={`${j.title} progress`} className="mt-4" />
                      <p className="mt-2 text-xs text-muted">
                        {p.done}/{p.total} lessons studied · last studied {formatRelative(j.last_studied_at)}
                      </p>
                    </>
                  ) : (
                    <p className="mt-4 text-xs text-warn">No roadmap yet — open to generate one.</p>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<BookOpen className="size-6" />}
          title={showArchived ? "No archived journeys" : "No journeys yet"}
          description={showArchived ? undefined : "Create a journey for anything you want to learn — LearnFlow builds the roadmap."}
          action={!showArchived && <ButtonLink href="/journeys/new">Create a journey</ButtonLink>}
        />
      )}
    </div>
  );
}
