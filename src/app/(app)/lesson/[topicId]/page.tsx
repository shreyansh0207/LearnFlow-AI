import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LessonGenerator } from "@/components/lesson/lesson-generator";
import { LessonView } from "@/components/lesson/lesson-view";
import { MasteryBadge } from "@/components/mastery-badge";
import { NotesPanel } from "@/components/notes-panel";
import { Alert, ButtonLink, Card, CardTitle } from "@/components/ui";
import { parseStoredLesson } from "@/lib/ai/schemas";
import { requireUser } from "@/lib/auth";
import { getJourneyOutline, getTopicContext } from "@/lib/data";
import { adaptiveAdvice, type MasteryStatus } from "@/lib/learning/mastery";
import { isUuid, pct } from "@/lib/utils";

export const metadata: Metadata = { title: "Lesson" };

export default async function LessonPage({ params, searchParams }: { params: Promise<{ topicId: string }>; searchParams: Promise<{ variant?: string }> }) {
  const { topicId } = await params;
  const { variant: variantParam } = await searchParams;
  if (!isUuid(topicId)) notFound();
  const { db } = await requireUser(`/lesson/${topicId}`);

  const ctx = await getTopicContext(db, topicId);
  if (!ctx) notFound();
  const variant = variantParam === "simpler" ? "simpler" : "standard";

  const [lessonRow, mastery, bookmark, notes, outline] = await Promise.all([
    db.maybeOne<{ content: unknown; source: "ai" | "demo" }>("select content, source from public.lessons where topic_id = $1 and variant = $2", [topicId, variant]),
    db.maybeOne<{ status: string; mastery: number; last_score: number | null; quiz_attempts: number; lesson_completed_at: string | null }>(
      "select status, mastery, last_score, quiz_attempts, lesson_completed_at from public.topic_mastery where topic_id = $1",
      [topicId],
    ),
    db.maybeOne("select id from public.bookmarks where topic_id = $1", [topicId]),
    db.query<{ id: string; body: string; updated_at: string }>("select id, body, updated_at from public.user_notes where topic_id = $1 order by updated_at desc limit 20", [topicId]),
    getJourneyOutline(db, ctx.journey.id),
  ]);

  const content = lessonRow ? parseStoredLesson(lessonRow.content) : null;
  const sourceRefs = ctx.topic.source_refs ?? [];
  const topicSources = sourceRefs.length
    ? await db.query<{ id: string; url: string; title: string; provider: string; published: string | null; license: string | null }>(
        "select id, url, title, provider, published, license from public.curriculum_sources where id = any($1::uuid[])",
        [sourceRefs],
      )
    : [];
  const status = (mastery?.status ?? "not_started") as MasteryStatus;
  const advice = adaptiveAdvice(status);

  const flat = outline?.flatTopics ?? [];
  const idx = flat.findIndex((t) => t.id === topicId);
  const nextInOrder = idx >= 0 ? flat[idx + 1] ?? null : null;
  const prevInOrder = idx > 0 ? flat[idx - 1] : null;

  return (
    <div className="space-y-6">
      {!ctx.isCurrentVersion && (
        <Alert kind="info" title="From an earlier roadmap version">
          This topic belongs to an older version of your roadmap. Your history here is preserved. <Link href={`/journeys/${ctx.journey.id}`}>Open the current roadmap</Link>.
        </Alert>
      )}

      {ctx.topic.safety_note && (
        <Alert kind="warn" title="Safety first" className="mx-auto max-w-3xl">
          {ctx.topic.safety_note}
        </Alert>
      )}

      {status === "needs_practice" && (
        <Card className="border-warn/30 bg-warn-soft">
          <CardTitle>{advice.headline}</CardTitle>
          <p className="mt-1 text-sm text-muted">
            Last quiz: {pct(mastery?.last_score)} · Mastery estimate {pct(mastery?.mastery)}
            {ctx.topic.prerequisites.length > 0 && <> · Builds on: {ctx.topic.prerequisites.join(", ")}</>}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {variant !== "simpler" && (
              <ButtonLink href={`/lesson/${topicId}?variant=simpler`} size="sm">
                Read a simpler explanation
              </ButtonLink>
            )}
            <ButtonLink href={`/quiz/${topicId}?mode=practice`} size="sm" variant="secondary">
              Targeted practice quiz
            </ButtonLink>
            {prevInOrder && (
              <ButtonLink href={`/lesson/${prevInOrder.id}`} size="sm" variant="ghost">
                Revisit “{prevInOrder.title}”
              </ButtonLink>
            )}
          </div>
        </Card>
      )}

      {content && lessonRow ? (
        <LessonView
          topicId={topicId}
          journeyId={ctx.journey.id}
          journeyTitle={ctx.journey.title}
          moduleTitle={ctx.module.title}
          estimatedMinutes={ctx.topic.estimated_minutes}
          content={content}
          source={lessonRow.source as "ai" | "demo"}
          variant={variant}
          bookmarked={Boolean(bookmark)}
          alreadyCompleted={Boolean(mastery?.lesson_completed_at)}
          nextTopic={nextInOrder ? { id: nextInOrder.id, title: nextInOrder.title } : null}
        />
      ) : (
        <div className="mx-auto max-w-3xl space-y-4">
          <div>
            <p className="text-xs font-medium text-muted">
              {ctx.journey.title} · {ctx.module.title}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{ctx.topic.title}</h1>
            {ctx.topic.summary && <p className="mt-1 text-sm text-muted">{ctx.topic.summary}</p>}
          </div>
          <LessonGenerator topicId={topicId} variant={variant} topicTitle={ctx.topic.title} autoStart />
        </div>
      )}

      <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
        <Card>
          <CardTitle className="text-sm">Your progress on this topic</CardTitle>
          <div className="mt-3 space-y-1.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted">Status</span>
              <MasteryBadge status={status} />
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Mastery estimate</span>
              <span className="tabular-nums">{mastery?.quiz_attempts || status === "needs_practice" ? pct(mastery?.mastery) : "Not assessed"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Quiz attempts</span>
              <span className="tabular-nums">{mastery?.quiz_attempts ?? 0}</span>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">{advice.headline}</p>
        </Card>
        <Card>
          <CardTitle className="text-sm">Notes</CardTitle>
          <div className="mt-3">
            <NotesPanel topicId={topicId} notes={notes} placeholder="Jot down what clicked, or a question to revisit…" />
          </div>
        </Card>
      </div>

      {topicSources.length > 0 && (
        <Card className="mx-auto max-w-3xl">
          <CardTitle className="text-sm">Sources related to this topic</CardTitle>
          <ul className="mt-2 space-y-1.5 text-sm">
            {topicSources.map((src) => (
              <li key={src.id}>
                <a href={src.url} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-primary hover:underline">
                  {src.title}
                </a>
                <span className="text-xs text-muted">
                  {" "}
                  · {src.provider}
                  {src.published && ` · ${src.published}`}
                  {src.license && ` · ${src.license}`}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted">These were retrieved when your roadmap was created. The lesson text above is AI-generated: use the sources to check important facts.</p>
        </Card>
      )}

      <nav aria-label="Lesson navigation" className="mx-auto flex max-w-3xl justify-between gap-2 text-sm">
        {prevInOrder ? (
          <Link href={`/lesson/${prevInOrder.id}`} className="min-w-0 truncate text-muted hover:text-ink">
            ← {prevInOrder.title}
          </Link>
        ) : (
          <span />
        )}
        {nextInOrder && (
          <Link href={`/lesson/${nextInOrder.id}`} className="min-w-0 truncate text-right text-muted hover:text-ink">
            {nextInOrder.title} →
          </Link>
        )}
      </nav>
    </div>
  );
}
