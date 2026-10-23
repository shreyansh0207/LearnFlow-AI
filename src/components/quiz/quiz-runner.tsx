"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CircleCheck, CircleX, LoaderCircle, RotateCcw } from "lucide-react";
import { MasteryBadge } from "@/components/mastery-badge";
import { Alert, Button, ButtonLink, Card, ProgressBar, SourceBadge } from "@/components/ui";
import type { MasteryStatus } from "@/lib/learning/mastery";
import { cn } from "@/lib/utils";

type Question = { id: string; prompt: string; options: string[] };

type Result = {
  questionId: string;
  prompt: string;
  options: string[];
  selectedIndex: number | null;
  correctIndex: number;
  correct: boolean;
  explanation: string | null;
  concept: string | null;
};

type SubmitResponse = {
  correct: number;
  total: number;
  score: number;
  results?: Result[];
  weakConcepts?: string[];
  mastery?: { mastery: number; status: MasteryStatus } | null;
  nextDifficulty?: "easier" | "standard" | "harder";
};

export function QuizRunner(props: {
  assessmentId: string;
  questions: Question[];
  kind: "quiz" | "practice" | "diagnostic";
  source: "ai" | "demo";
  difficulty: string;
  topicId?: string;
  nextTopic?: { id: string; title: string } | null;
  /** Diagnostic only: topics in order, matched to questions by concept = topic title. */
  diagnosticTopics?: Array<{ id: string; title: string }>;
  journeyId?: string;
}) {
  const router = useRouter();
  const { questions } = props;
  const attemptId = useMemo(() => crypto.randomUUID(), []);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResponse | null>(null);

  const q = questions[index];
  const answeredCount = Object.values(answers).filter((v) => v !== null && v !== undefined).length;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/quiz/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId, assessmentId: props.assessmentId, answers }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) setError(data?.error?.message ?? "Your answers couldn't be submitted. Please try again.");
      else {
        setResult(data);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {
      setError("You appear to be offline. Your answers are still here — submit again when you reconnect.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    const pctScore = Math.round(result.score * 100);
    const diagnosticStart =
      props.kind === "diagnostic" && props.diagnosticTopics
        ? props.diagnosticTopics.find((t) => {
            const r = result.results?.find((x) => x.concept?.trim().toLowerCase() === t.title.trim().toLowerCase());
            return r && !r.correct;
          }) ?? null
        : null;

    return (
      <div className="space-y-5">
        <Card className="text-center">
          <p className="text-sm text-muted">{props.kind === "diagnostic" ? "Diagnostic complete" : "Your score"}</p>
          <p className="mt-1 text-5xl font-semibold tabular-nums">{pctScore}%</p>
          <p className="mt-1 text-sm text-muted">
            {result.correct} of {result.total} correct
          </p>
          {result.mastery && (
            <div className="mt-3 flex justify-center">
              <MasteryBadge status={result.mastery.status} />
            </div>
          )}
          <div className="mt-5 space-y-3 text-left">
            {props.kind === "diagnostic" ? (
              <Alert kind="info" title="Where to start">
                {diagnosticStart
                  ? `Start with “${diagnosticStart.title}” — that's the first topic where a question tripped you up. Earlier topics will be quick reviews.`
                  : "You answered every diagnostic question correctly. Start at the beginning for a quick foundation pass, or skip ahead to topics that feel new."}
              </Alert>
            ) : result.score < 0.6 ? (
              <Alert kind="warn" title="This topic needs another pass">
                That&apos;s completely normal. Try the simpler explanation, then a targeted practice quiz. Your mistakes have been added to your review deck.
              </Alert>
            ) : result.score < 0.9 ? (
              <Alert kind="info" title="Good progress">A little targeted practice will lock this in. Missed questions were added to your review deck.</Alert>
            ) : (
              <Alert kind="success" title="Strong understanding">You can move on — or try a harder challenge to stretch yourself.</Alert>
            )}
            {result.weakConcepts && result.weakConcepts.length > 0 && props.kind !== "diagnostic" && (
              <p className="text-sm text-muted">
                <span className="font-medium text-ink">To revisit:</span> {result.weakConcepts.join(", ")}
              </p>
            )}
          </div>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {props.kind === "diagnostic" ? (
              <>
                {(diagnosticStart ?? props.diagnosticTopics?.[0]) && (
                  <ButtonLink href={`/lesson/${(diagnosticStart ?? props.diagnosticTopics![0]).id}`}>Start learning</ButtonLink>
                )}
                {props.journeyId && (
                  <ButtonLink href={`/journeys/${props.journeyId}`} variant="secondary">
                    Back to roadmap
                  </ButtonLink>
                )}
              </>
            ) : (
              <>
                {result.score < 0.6 && props.topicId && (
                  <>
                    <ButtonLink href={`/lesson/${props.topicId}?variant=simpler`}>Simpler explanation</ButtonLink>
                    <ButtonLink href={`/quiz/${props.topicId}?mode=practice&new=1`} variant="secondary">
                      Practice quiz
                    </ButtonLink>
                  </>
                )}
                {result.score >= 0.6 && props.nextTopic && <ButtonLink href={`/lesson/${props.nextTopic.id}`}>Next topic</ButtonLink>}
                {result.score >= 0.9 && props.topicId && (
                  <ButtonLink href={`/quiz/${props.topicId}?mode=harder&new=1`} variant="secondary">
                    Harder challenge
                  </ButtonLink>
                )}
                {result.score >= 0.6 && result.score < 0.9 && props.topicId && (
                  <ButtonLink href={`/quiz/${props.topicId}?new=1`} variant="secondary">
                    <RotateCcw aria-hidden className="size-4" /> New quiz
                  </ButtonLink>
                )}
                <Button variant="ghost" onClick={() => router.push("/review")}>
                  Go to reviews
                </Button>
              </>
            )}
          </div>
        </Card>

        {result.results && (
          <section className="space-y-3">
            <h2 className="font-semibold">Review your answers</h2>
            {result.results.map((r, i) => (
              <Card key={r.questionId} className="p-4">
                <div className="flex gap-2">
                  {r.correct ? <CircleCheck aria-label="Correct" className="mt-0.5 size-5 shrink-0 text-success" /> : <CircleX aria-label="Incorrect" className="mt-0.5 size-5 shrink-0 text-danger" />}
                  <p className="text-sm font-medium">
                    {i + 1}. {r.prompt}
                  </p>
                </div>
                <ul className="mt-3 space-y-1.5 pl-7 text-sm">
                  {r.options.map((o, oi) => (
                    <li
                      key={oi}
                      className={cn(
                        "rounded-lg px-2.5 py-1.5",
                        oi === r.correctIndex && "bg-success-soft font-medium",
                        oi === r.selectedIndex && oi !== r.correctIndex && "bg-danger-soft line-through decoration-danger/60",
                      )}
                    >
                      {o}
                      {oi === r.selectedIndex && <span className="ml-1 text-xs text-muted">(your answer)</span>}
                    </li>
                  ))}
                </ul>
                {r.explanation && <p className="mt-3 pl-7 text-sm text-muted">{r.explanation}</p>}
              </Card>
            ))}
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 text-sm text-muted">
        <span>
          Question {index + 1} of {questions.length}
        </span>
        <span className="flex items-center gap-2">
          <SourceBadge source={props.source} />
          {props.kind !== "diagnostic" && <span className="capitalize">{props.difficulty}</span>}
        </span>
      </div>
      <ProgressBar value={(index + 1) / questions.length} label="Quiz progress" />

      <Card className="p-5 sm:p-6">
        <fieldset key={q.id}>
          <legend className="text-base font-medium leading-relaxed">{q.prompt}</legend>
          <div className="mt-4 grid gap-2.5">
            {q.options.map((opt, i) => {
              const selected = answers[q.id] === i;
              return (
                <label
                  key={i}
                  className={cn(
                    "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors",
                    selected ? "border-primary bg-primary-soft" : "border-border hover:bg-surface-2",
                  )}
                >
                  <input type="radio" name={q.id} className="accent-primary" checked={selected} onChange={() => setAnswers((a) => ({ ...a, [q.id]: i }))} />
                  <span>{opt}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </Card>

      {error && <Alert kind="error">{error}</Alert>}

      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => setIndex((i) => i - 1)} disabled={index === 0}>
          <ArrowLeft aria-hidden className="size-4" /> Back
        </Button>
        {index < questions.length - 1 ? (
          <Button onClick={() => setIndex((i) => i + 1)}>
            Next <ArrowRight aria-hidden className="size-4" />
          </Button>
        ) : (
          <Button onClick={submit} disabled={submitting}>
            {submitting && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
            Submit {answeredCount < questions.length ? `(${questions.length - answeredCount} unanswered)` : "answers"}
          </Button>
        )}
      </div>
      <p className="text-center text-xs text-muted">
        Answers are scored on the server. <Link href={props.topicId ? `/lesson/${props.topicId}` : "/dashboard"} className="underline">Leave quiz</Link>
      </p>
    </div>
  );
}
