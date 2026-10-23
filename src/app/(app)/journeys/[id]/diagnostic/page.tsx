import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QuizRunner } from "@/components/quiz/quiz-runner";
import { QuizStarter } from "@/components/quiz/quiz-starter";
import { requireUser } from "@/lib/auth";
import { getJourneyOutline } from "@/lib/data";
import { findOpenAssessment } from "@/lib/learning/assessments";
import { isUuid } from "@/lib/utils";

export const metadata: Metadata = { title: "Diagnostic" };

export default async function DiagnosticPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { db } = await requireUser(`/journeys/${id}/diagnostic`);
  const outline = await getJourneyOutline(db, id);
  if (!outline) notFound();
  const open = await findOpenAssessment(db, { journeyId: id, kind: "diagnostic" });

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <Link href={`/journeys/${id}`} className="text-sm text-muted hover:text-ink">← Back to roadmap</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Find your starting point</h1>
        <p className="mt-1 text-sm text-muted">One quick question per early topic. It only recommends where to start — it won&apos;t change your mastery scores.</p>
      </div>
      {open && open.questions.length > 0 ? (
        <QuizRunner
          assessmentId={open.id}
          questions={open.questions}
          kind="diagnostic"
          source={open.source}
          difficulty={open.difficulty}
          journeyId={id}
          diagnosticTopics={outline.flatTopics.map((t) => ({ id: t.id, title: t.title }))}
        />
      ) : (
        <QuizStarter endpoint={`/api/journeys/${id}/diagnostic`} body={{}} title="Diagnostic" description="About 5 questions, 2–3 minutes." />
      )}
    </div>
  );
}
