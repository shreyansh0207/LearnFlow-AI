"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight, LoaderCircle, Sparkles } from "lucide-react";
import { Alert, Button, Card, Hint, Input, Label, Select, Textarea } from "@/components/ui";
import { LEARNING_PATTERNS, PATTERN_LABEL, type LearningPattern } from "@/lib/catalog/patterns";
import { cn } from "@/lib/utils";
import {
  CURRENT_LEVELS,
  CURRENT_LEVEL_LABEL,
  LEARNING_STYLES,
  STYLE_LABEL,
  TARGET_LEVELS,
  TARGET_LEVEL_LABEL,
} from "@/lib/validation";

const SUGGESTIONS = ["Personal finance", "Real estate investing", "Psychology", "Python programming", "Machine learning", "Entrepreneurship", "Digital marketing", "Economics", "Public speaking"];

type State = {
  subject: string;
  goal: string;
  currentLevel: (typeof CURRENT_LEVELS)[number];
  targetLevel: (typeof TARGET_LEVELS)[number];
  motivation: string;
  learningStyles: Array<(typeof LEARNING_STYLES)[number]>;
  minutesPerDay: number;
  daysPerWeek: number;
  deadline: string;
  learningPattern: LearningPattern;
};

const STEPS = ["What", "Level", "Why & how", "Time", "Review"] as const;

export function JourneyForm({
  onboarding,
  initialSubject = "",
  initialGoal = "",
  initialPattern,
  knowledgeNodeId,
  topicName,
}: {
  onboarding: boolean;
  initialSubject?: string;
  initialGoal?: string;
  initialPattern?: LearningPattern | null;
  /** Catalog topic this journey is based on (from discovery or a topic page). */
  knowledgeNodeId?: string | null;
  topicName?: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  // Same id for every retry of this form, so the server never creates duplicate journeys.
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [s, setS] = useState<State>({
    subject: initialSubject,
    goal: initialGoal,
    currentLevel: "none",
    targetLevel: "intermediate",
    motivation: "",
    learningStyles: ["examples", "exercises"],
    minutesPerDay: 20,
    daysPerWeek: 5,
    deadline: "",
    learningPattern: initialPattern ?? "mixed",
  });
  const set = <K extends keyof State>(k: K, v: State[K]) => setS((prev) => ({ ...prev, [k]: v }));

  const canNext = step !== 0 || s.subject.trim().length >= 2;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/journeys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...s, onboarding, requestId, knowledgeNodeId: knowledgeNodeId ?? null, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.journeyId) {
        setError(data?.error?.message ?? "Could not create your journey. Please try again.");
        setBusy(false);
        return;
      }
      const qs = new URLSearchParams({ new: "1" });
      if (data.curriculumError) qs.set("genError", data.curriculumError.message);
      router.push(`/journeys/${data.journeyId}?${qs.toString()}`);
      router.refresh();
    } catch {
      setError("You appear to be offline. Creating a journey needs a connection.");
      setBusy(false);
    }
  }

  if (busy) {
    return (
      <Card className="flex flex-col items-center px-6 py-14 text-center" aria-live="polite">
        <div className="brand-gradient flex size-14 items-center justify-center rounded-2xl text-white">
          <Sparkles aria-hidden className="size-6" />
        </div>
        <h2 className="mt-5 text-lg font-semibold">Designing your learning journey…</h2>
        <p className="mt-2 max-w-sm text-sm text-muted">
          Building modules, topics and checkpoints for <strong className="text-ink">{s.subject}</strong>, matched to your level and schedule. This can take up to a minute.
        </p>
        <LoaderCircle aria-hidden className="mt-6 size-6 animate-spin text-primary" />
      </Card>
    );
  }

  return (
    <Card className="p-5 sm:p-7">
      <ol className="mb-6 flex gap-1.5" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className="flex-1">
            <div className={cn("h-1.5 rounded-full", i <= step ? "bg-primary" : "bg-surface-2")} />
            <span className={cn("mt-1.5 hidden text-xs sm:block", i === step ? "font-medium text-ink" : "text-muted")}>{label}</span>
          </li>
        ))}
      </ol>
      <p className="sr-only" aria-live="polite">
        Step {step + 1} of {STEPS.length}: {STEPS[step]}
      </p>

      {error && <Alert kind="error" className="mb-4">{error}</Alert>}

      {step === 0 && (
        <div className="space-y-5">
          <div>
            <Label htmlFor="subject">What do you want to learn?</Label>
            <Input id="subject" value={s.subject} onChange={(e) => set("subject", e.target.value)} placeholder="e.g. Personal finance, Stoic philosophy, React…" maxLength={160} autoFocus />
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set("subject", t)}
                  className={cn("rounded-full border px-3 py-1.5 text-sm", s.subject === t ? "border-primary bg-primary-soft text-primary" : "border-border text-muted hover:text-ink")}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="goal">What&apos;s your specific goal? <span className="font-normal text-muted">(optional)</span></Label>
            <Textarea id="goal" value={s.goal} onChange={(e) => set("goal", e.target.value)} maxLength={1000} placeholder="e.g. Understand investing well enough to manage my own retirement savings" />
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Where are you starting from?</legend>
            <div className="space-y-2">
              {CURRENT_LEVELS.map((l) => (
                <label key={l} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 text-sm", s.currentLevel === l ? "border-primary bg-primary-soft" : "border-border")}>
                  <input type="radio" name="currentLevel" className="accent-primary" checked={s.currentLevel === l} onChange={() => set("currentLevel", l)} />
                  {CURRENT_LEVEL_LABEL[l]}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <Label htmlFor="target">Where do you want to get to?</Label>
            <Select id="target" value={s.targetLevel} onChange={(e) => set("targetLevel", e.target.value as State["targetLevel"])}>
              {TARGET_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {TARGET_LEVEL_LABEL[l]}
                </option>
              ))}
            </Select>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div>
            <Label htmlFor="motivation">Why do you want to learn this? <span className="font-normal text-muted">(optional)</span></Label>
            <Textarea id="motivation" value={s.motivation} onChange={(e) => set("motivation", e.target.value)} maxLength={1000} placeholder="e.g. I want to stop feeling lost when people talk about money" />
            <Hint>Your reason helps LearnFlow choose relevant examples.</Hint>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">How do you like to learn? <span className="font-normal text-muted">(pick any)</span></legend>
            <div className="grid grid-cols-2 gap-2">
              {LEARNING_STYLES.map((st) => {
                const on = s.learningStyles.includes(st);
                return (
                  <label key={st} className={cn("flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm", on ? "border-primary bg-primary-soft" : "border-border")}>
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={on}
                      onChange={() => set("learningStyles", on ? s.learningStyles.filter((x) => x !== st) : [...s.learningStyles, st])}
                    />
                    {STYLE_LABEL[st]}
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5">
          <div>
            <Label htmlFor="minutes">How much time can you spend per day?</Label>
            <Select id="minutes" value={s.minutesPerDay} onChange={(e) => set("minutesPerDay", Number(e.target.value))}>
              {[10, 15, 20, 30, 45, 60, 90].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="days">How many days per week?</Label>
            <Select id="days" value={s.daysPerWeek} onChange={(e) => set("daysPerWeek", Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <option key={d} value={d}>
                  {d} {d === 1 ? "day" : "days"}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="deadline">Do you have a deadline? <span className="font-normal text-muted">(optional)</span></Label>
            <Input id="deadline" type="date" value={s.deadline} onChange={(e) => set("deadline", e.target.value)} min={new Date().toISOString().slice(0, 10)} />
          </div>
        </div>
      )}

      {step === 4 && knowledgeNodeId && topicName && (
        <p className="mb-3 rounded-xl bg-primary-soft px-3 py-2 text-sm">Based on the catalog topic <strong>{topicName}</strong>. Its prerequisites and branches guide your roadmap.</p>
      )}
      {step === 4 && (
        <div className="mb-4">
          <Label htmlFor="pattern">Course shape</Label>
          <Select id="pattern" value={s.learningPattern} onChange={(e) => set("learningPattern", e.target.value as LearningPattern)}>
            {LEARNING_PATTERNS.map((p) => (
              <option key={p} value={p}>
                {PATTERN_LABEL[p]}
              </option>
            ))}
          </Select>
          <Hint>Languages, hands-on skills, maths and creative work are each taught differently. Pick what fits, or keep the suggestion.</Hint>
        </div>
      )}
      {step === 4 && (
        <dl className="divide-y divide-border rounded-xl border border-border text-sm">
          {[
            ["Subject", s.subject],
            ["Goal", s.goal || "—"],
            ["Starting level", CURRENT_LEVEL_LABEL[s.currentLevel]],
            ["Target", TARGET_LEVEL_LABEL[s.targetLevel]],
            ["Why", s.motivation || "—"],
            ["Formats", s.learningStyles.map((x) => STYLE_LABEL[x]).join(", ") || "A mix"],
            ["Schedule", `${s.minutesPerDay} min/day, ${s.daysPerWeek} days/week`],
            ["Deadline", s.deadline || "None"],
          ].map(([k, v]) => (
            <div key={k} className="grid grid-cols-[7rem_1fr] gap-3 px-4 py-2.5">
              <dt className="text-muted">{k}</dt>
              <dd className="min-w-0 break-words">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-7 flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => setStep((n) => n - 1)} disabled={step === 0}>
          <ArrowLeft aria-hidden className="size-4" /> Back
        </Button>
        <div className="flex gap-2">
          {(step === 2 || step === 3) && (
            <Button variant="secondary" onClick={() => setStep((n) => n + 1)}>
              Skip
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((n) => n + 1)} disabled={!canNext}>
              Next <ArrowRight aria-hidden className="size-4" />
            </Button>
          ) : (
            <Button onClick={submit}>
              <Sparkles aria-hidden className="size-4" /> Create my roadmap
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
