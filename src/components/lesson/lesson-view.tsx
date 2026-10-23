"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  CircleCheck,
  CloudDownload,
  CloudOff,
  Lightbulb,
  ListChecks,
  LoaderCircle,
  MessageCircle,
  Sparkles,
  Target,
} from "lucide-react";
import { toggleBookmark } from "@/app/actions/notes";
import { CheckAnswerButton } from "@/components/ai-tools";
import { Markdown } from "@/components/markdown";
import { Alert, Badge, Button, ButtonLink, Card, CardTitle, SourceBadge, Textarea } from "@/components/ui";
import type { LessonContent } from "@/lib/ai/schemas";
import { ACTION_LABEL, type LessonAction } from "@/lib/ai/prompts";
import { postOrQueue } from "@/lib/offline-queue";
import { isSaved, removeSaved, SAVED_EVENT, saveLesson } from "@/lib/saved-lessons";
import { useWindowValue } from "@/lib/use-browser";
import { cn } from "@/lib/utils";

const ACTIONS = Object.keys(ACTION_LABEL) as LessonAction[];

function CheckQuestion({ q, index }: { q: LessonContent["checkQuestions"][number]; index: number }) {
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;
  return (
    <fieldset className="rounded-xl border border-border p-4">
      <legend className="sr-only">Comprehension check {index + 1}</legend>
      <p className="text-sm font-medium">
        {index + 1}. {q.question}
      </p>
      <div className="mt-3 grid gap-2">
        {q.options.map((opt, i) => {
          const correct = i === q.answerIndex;
          return (
            <button
              key={i}
              type="button"
              disabled={answered}
              onClick={() => setPicked(i)}
              aria-pressed={picked === i}
              className={cn(
                "min-h-11 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors",
                !answered && "border-border hover:border-primary hover:bg-primary-soft",
                answered && correct && "border-success bg-success-soft",
                answered && picked === i && !correct && "border-danger bg-danger-soft",
                answered && picked !== i && !correct && "border-border opacity-60",
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {answered && (
        <p className="mt-3 text-sm text-muted" role="status">
          <strong className={picked === q.answerIndex ? "text-success" : "text-danger"}>{picked === q.answerIndex ? "Correct. " : "Not quite. "}</strong>
          {q.explanation}
        </p>
      )}
    </fieldset>
  );
}

function Section({ icon, title, children }: { icon?: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

export function LessonView(props: {
  topicId: string;
  journeyId: string;
  journeyTitle: string;
  moduleTitle: string;
  estimatedMinutes: number;
  content: LessonContent;
  source: "ai" | "demo";
  variant: "standard" | "simpler";
  bookmarked: boolean;
  alreadyCompleted: boolean;
  nextTopic: { id: string; title: string } | null;
}) {
  const { content: c, topicId } = props;
  const [bookmarked, setBookmarked] = useState(props.bookmarked);
  const saved = useWindowValue([SAVED_EVENT, "storage"], () => isSaved(topicId), false);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [completeState, setCompleteState] = useState<"idle" | "busy" | "done" | "queued">(props.alreadyCompleted ? "done" : "idle");
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [actionResults, setActionResults] = useState<Array<{ action: LessonAction; text: string; source: string }>>([]);
  const [actionBusy, setActionBusy] = useState<LessonAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [attempt, setAttempt] = useState("");
  const [bmPending, startBm] = useTransition();

  // Active study time: counts only while the page is visible, capped to 3 hours.
  const activeMs = useRef(0);
  const lastTick = useRef<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      if (lastTick.current !== null && document.visibilityState === "visible") activeMs.current += Math.min(now - lastTick.current, 60_000);
      lastTick.current = now;
    };
    lastTick.current = Date.now();
    const interval = window.setInterval(tick, 15_000);
    const onVis = () => {
      tick();
    };
    document.addEventListener("visibilitychange", onVis);

    // Record that this lesson was opened (one event per page view).
    void postOrQueue("/api/events", { id: crypto.randomUUID(), type: "lesson_started", topicId }).catch(() => {});

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [topicId]);

  async function complete() {
    setCompleteState("busy");
    setCompleteError(null);
    const now = Date.now();
    if (lastTick.current !== null && document.visibilityState === "visible") activeMs.current += Math.min(now - lastTick.current, 60_000);
    lastTick.current = now;
    try {
      const result = await postOrQueue("/api/events", {
        id: crypto.randomUUID(),
        type: "lesson_completed",
        topicId,
        confidence,
        durationSeconds: Math.min(3 * 3600, Math.round(activeMs.current / 1000)),
        occurredAt: new Date().toISOString(),
      });
      setCompleteState(result.status === "queued" ? "queued" : "done");
    } catch (e) {
      setCompleteError(e instanceof Error ? e.message : "Could not save. Please try again.");
      setCompleteState("idle");
    }
  }

  async function runAction(action: LessonAction) {
    setActionBusy(action);
    setActionError(null);
    try {
      const res = await fetch(`/api/lessons/${topicId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) setActionError(data?.error?.message ?? "That didn't work. Please try again.");
      else setActionResults((r) => [{ action, text: data.text, source: data.source }, ...r]);
    } catch {
      setActionError("You appear to be offline. This needs a connection.");
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <article className="mx-auto max-w-3xl space-y-8">
      <header>
        <p className="text-xs font-medium text-muted">
          <Link href={`/journeys/${props.journeyId}`} className="hover:text-ink">{props.journeyTitle}</Link> · {props.moduleTitle}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{c.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge>{props.estimatedMinutes} min</Badge>
          <SourceBadge source={props.source} />
          {props.variant === "simpler" && <Badge tone="primary">Simpler version</Badge>}
          <div className="ml-auto flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={bmPending}
              aria-pressed={bookmarked}
              onClick={() =>
                startBm(async () => {
                  const res = await toggleBookmark(topicId);
                  if (res.bookmarked !== undefined) setBookmarked(res.bookmarked);
                })
              }
            >
              {bookmarked ? <BookmarkCheck aria-hidden className="size-4 text-primary" /> : <Bookmark aria-hidden className="size-4" />}
              {bookmarked ? "Bookmarked" : "Bookmark"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-pressed={saved}
              onClick={() => {
                try {
                  if (saved) removeSaved(topicId);
                  else saveLesson({ topicId, title: c.title, journeyTitle: props.journeyTitle, content: c });
                } catch {
                  alert("This browser couldn't store the lesson (storage may be full or disabled).");
                }
              }}
            >
              {saved ? <CloudOff aria-hidden className="size-4" /> : <CloudDownload aria-hidden className="size-4" />}
              {saved ? "Saved offline" : "Save for offline"}
            </Button>
          </div>
        </div>
      </header>

      {c.disclaimer && <Alert kind="warn">{c.disclaimer}</Alert>}

      {c.objectives.length > 0 && (
        <Card className="bg-surface-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Target aria-hidden className="size-4 text-primary" /> By the end of this lesson you will be able to
          </CardTitle>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {c.objectives.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </Card>
      )}

      <Section title="Explanation">
        <Markdown text={c.explanation} className="text-[15.5px]" />
      </Section>

      {c.keyTerms.length > 0 && (
        <Section title="Key terms">
          <dl className="grid gap-2 sm:grid-cols-2">
            {c.keyTerms.map((t) => (
              <div key={t.term} className="rounded-xl border border-border p-3">
                <dt className="text-sm font-semibold">{t.term}</dt>
                <dd className="mt-1 text-sm text-muted">{t.definition}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      {c.analogies.length > 0 && (
        <Section icon={<Lightbulb aria-hidden className="size-4 text-warn" />} title="Think of it like this">
          {c.analogies.map((a) => (
            <p key={a} className="rounded-xl bg-warn-soft p-4 text-sm leading-relaxed">{a}</p>
          ))}
        </Section>
      )}

      {c.examples.length > 0 && (
        <Section title="Examples">
          <div className="space-y-3">
            {c.examples.map((e) => (
              <Card key={e.title} className="p-4">
                <h3 className="text-sm font-semibold">{e.title}</h3>
                <Markdown text={e.body} className="text-sm" />
              </Card>
            ))}
          </div>
        </Section>
      )}

      {c.steps.length > 0 && (
        <Section icon={<ListChecks aria-hidden className="size-4 text-primary" />} title="Step by step">
          <ol className="space-y-3">
            {c.steps.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">{i + 1}</span>
                <div className="pt-0.5">
                  <p className="text-sm font-semibold">{s.title}</p>
                  <p className="mt-0.5 text-sm text-muted">{s.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {c.checkQuestions.length > 0 && (
        <Section title="Quick check">
          <p className="-mt-1 text-sm text-muted">Not scored — just a quick self-check.</p>
          <div className="space-y-3">
            {c.checkQuestions.map((q, i) => (
              <CheckQuestion key={q.question} q={q} index={i} />
            ))}
          </div>
        </Section>
      )}

      {c.exercise.task && (
        <Section title="Try it yourself">
          <Card className="space-y-3">
            {c.exercise.scenario && <p className="text-sm leading-relaxed">{c.exercise.scenario}</p>}
            <p className="text-sm font-semibold">{c.exercise.task}</p>
            <Textarea value={attempt} onChange={(e) => setAttempt(e.target.value)} placeholder="Write your attempt here before revealing the model answer…" aria-label="Your attempt" maxLength={4000} />
            {props.source === "ai" && <CheckAnswerButton topicId={topicId} answer={attempt} />}
            {showAnswer ? (
              <div className="rounded-xl bg-success-soft p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-success">Model answer</p>
                <Markdown text={c.exercise.modelAnswer} className="text-sm" />
              </div>
            ) : (
              <Button variant="secondary" onClick={() => setShowAnswer(true)}>
                Reveal model answer
              </Button>
            )}
          </Card>
        </Section>
      )}

      {c.recap.length > 0 && (
        <Section title="Recap">
          <ul className="space-y-2">
            {c.recap.map((r) => (
              <li key={r} className="flex gap-2 text-sm">
                <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" /> {r}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section icon={<Sparkles aria-hidden className="size-4 text-accent" />} title="Need it another way?">
        <div className="flex flex-wrap gap-2">
          {ACTIONS.map((a) => (
            <Button key={a} size="sm" variant="secondary" disabled={actionBusy !== null} onClick={() => runAction(a)}>
              {actionBusy === a && <LoaderCircle aria-hidden className="size-3.5 animate-spin" />}
              {ACTION_LABEL[a]}
            </Button>
          ))}
          <ButtonLink size="sm" variant="secondary" href={`/quiz/${topicId}`}>
            Test my understanding
          </ButtonLink>
          <ButtonLink size="sm" variant="ghost" href={`/tutor?topic=${topicId}`}>
            <MessageCircle aria-hidden className="size-4" /> Ask the tutor
          </ButtonLink>
        </div>
        {actionError && <Alert kind="error">{actionError}</Alert>}
        <div className="space-y-3" aria-live="polite">
          {actionResults.map((r, i) => (
            <Card key={`${r.action}-${i}`} className="animate-fade-up border-accent/30 p-4">
              <div className="mb-1 flex items-center gap-2">
                <p className="text-xs font-semibold text-accent">{ACTION_LABEL[r.action]}</p>
                <SourceBadge source={r.source} />
              </div>
              <Markdown text={r.text} className="text-sm" />
            </Card>
          ))}
        </div>
      </Section>

      <Card className="space-y-4">
        {completeState === "done" || completeState === "queued" ? (
          <>
            <Alert kind="success" title={completeState === "queued" ? "Saved on this device" : "Lesson complete"}>
              {completeState === "queued"
                ? "You're offline — your completion will sync automatically when you reconnect."
                : "Nice work. Completing a lesson is one step; a quiz shows how well it stuck."}
            </Alert>
            {c.nextStep && <p className="text-sm text-muted">{c.nextStep}</p>}
            <div className="flex flex-wrap gap-2">
              <ButtonLink href={`/quiz/${topicId}`}>
                Take the quiz <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
              {props.nextTopic && (
                <ButtonLink href={`/lesson/${props.nextTopic.id}`} variant="secondary">
                  Next: {props.nextTopic.title.length > 32 ? `${props.nextTopic.title.slice(0, 32)}…` : props.nextTopic.title}
                </ButtonLink>
              )}
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="text-sm font-semibold">How confident do you feel about this topic?</p>
              <p className="text-xs text-muted">Optional. Used as a small signal alongside your quiz results.</p>
              <div className="mt-3 flex gap-2" role="radiogroup" aria-label="Confidence from 1 to 5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={confidence === n}
                    onClick={() => setConfidence(confidence === n ? null : n)}
                    className={cn("size-11 rounded-xl border text-sm font-semibold", confidence === n ? "border-primary bg-primary text-primary-ink" : "border-border")}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="mt-1 flex w-62 justify-between text-[11px] text-muted">
                <span>Lost</span>
                <span>Very confident</span>
              </div>
            </div>
            {completeError && <Alert kind="error">{completeError}</Alert>}
            <Button size="lg" onClick={complete} disabled={completeState === "busy"}>
              {completeState === "busy" ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <CircleCheck aria-hidden className="size-4" />}
              Mark lesson complete
            </Button>
          </>
        )}
      </Card>
    </article>
  );
}
