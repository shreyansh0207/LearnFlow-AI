import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QuizRunner } from "@/components/quiz/quiz-runner";
import { QuizStarter } from "@/components/quiz/quiz-starter";
import { requireUser } from "@/lib/auth";
import { getJourneyOutline, getTopicContext } from "@/lib/data";
import { findOpenAssessment } from "@/lib/learning/assessments";
import { isUuid } from "@/lib/utils";

export const metadata: Metadata = { title: "Quiz" };

export default async function QuizPage({ params, searchParams }: { params: Promise<{ topicId: string }>; searchParams: Promise<{ mode?: string; new?: string }> }) {
  const { topicId } = await params;
  const sp = await searchParams;
  if (!isUuid(topicId)) notFound();
  const { db } = await requireUser(`/quiz/${topicId}`);
  const ctx = await getTopicContext(db, topicId);
  if (!ctx) notFound();

  const mode = sp.mode === "practice" ? "practice" : sp.mode === "harder" ? "harder" : "quiz";
  const kind = mode === "practice" ? "practice" : "quiz";
  // "new=1" means the learner asked for a fresh quiz; otherwise resume an unanswered one.
  const open = sp.new ? null : await findOpenAssessment(db, { topicId, kind });
  const outline = await getJourneyOutline(db, ctx.journey.id);
  const flat = outline?.flatTopics ?? [];
  const idx = flat.findIndex((t) => t.id === topicId);
  const next = idx >= 0 ? flat[idx + 1] ?? null : null;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <Link href={`/lesson/${topicId}`} className="text-sm text-muted hover:text-ink">← Back to lesson</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {mode === "practice" ? "Targeted practice" : mode === "harder" ? "Harder challenge" : "Quiz"}: {ctx.topic.title}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {mode === "practice" ? "Easier questions focused on concepts you missed before." : "Your result updates your mastery estimate for this topic."}
        </p>
      </div>
      {open && open.questions.length > 0 ? (
        <QuizRunner
          assessmentId={open.id}
          questions={open.questions}
          kind={kind}
          source={open.source}
          difficulty={open.difficulty}
          topicId={topicId}
          nextTopic={next ? { id: next.id, title: next.title } : null}
        />
      ) : (
        <QuizStarter
          key={`${mode}-${sp.new ?? ""}`}
          endpoint={`/api/quiz/${topicId}`}
          body={{ mode }}
          redirectTo={`/quiz/${topicId}${mode === "practice" ? "?mode=practice" : ""}`}
          title={mode === "practice" ? "Practice quiz" : "Quiz"}
          description="A short multiple-choice quiz on this topic."
        />
      )}
    </div>
  );
}
