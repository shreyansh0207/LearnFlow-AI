"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LoaderCircle, Plus, ScanSearch, SlidersHorizontal } from "lucide-react";
import { updateJourneyGoal } from "@/app/actions/journey";
import { Alert, Button, Hint, Input, Label, Select, Textarea } from "@/components/ui";
import { LEARNING_PATTERNS, PATTERN_LABEL, type LearningPattern } from "@/lib/catalog/patterns";
import { CURRENT_LEVELS, CURRENT_LEVEL_LABEL, TARGET_LEVELS, TARGET_LEVEL_LABEL } from "@/lib/validation";

async function post(url: string, body?: unknown) {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => null);
    return res.ok ? { ok: true as const, data } : { ok: false as const, error: (data?.error?.message as string) ?? "Something went wrong. Nothing was changed." };
  } catch {
    return { ok: false as const, error: "You appear to be offline." };
  }
}

export function RunReviewButton({ journeyId, hasReview }: { journeyId: string; hasReview: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const r = await post(`/api/journeys/${journeyId}/review`);
          setBusy(false);
          if (!r.ok) setError(r.error);
          else router.refresh();
        }}
      >
        {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <ScanSearch aria-hidden className="size-4" />}
        {busy ? "Reviewing the curriculum…" : hasReview ? "Re-run AI gap analysis" : "Run AI gap analysis"}
      </Button>
      {error && <Alert kind="error">{error}</Alert>}
    </div>
  );
}

export function ExpandCurriculumForm({ journeyId, suggestions = [] }: { journeyId: string; suggestions?: string[] }) {
  const router = useRouter();
  const [focus, setFocus] = useState("");
  const [placement, setPlacement] = useState<"append" | "prerequisites">("append");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        const r = await post(`/api/journeys/${journeyId}/expand`, { focus, placement });
        setBusy(false);
        if (!r.ok) setMsg({ kind: "error", text: r.error });
        else {
          setMsg({ kind: "success", text: `Added ${r.data.added} topic(s). Your completed lessons and progress are unchanged.` });
          setFocus("");
          router.refresh();
        }
      }}
    >
      <div>
        <Label htmlFor="expand-focus">Add an area to this roadmap</Label>
        <Input id="expand-focus" value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. Pronunciation drills, Tax implications, Advanced joinery" maxLength={200} />
        {suggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestions.slice(0, 6).map((s) => (
              <button key={s} type="button" onClick={() => setFocus(s.slice(0, 200))} className="rounded-full border border-border px-2.5 py-1 text-xs text-muted hover:border-primary hover:text-ink">
                + {s.length > 60 ? `${s.slice(0, 60)}…` : s}
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <Label htmlFor="expand-placement">Where</Label>
        <Select id="expand-placement" value={placement} onChange={(e) => setPlacement(e.target.value as "append" | "prerequisites")}>
          <option value="append">After the current modules</option>
          <option value="prerequisites">Before everything (missing prerequisite knowledge)</option>
        </Select>
      </div>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <Button type="submit" size="sm" disabled={busy || focus.trim().length < 3}>
        {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Plus aria-hidden className="size-4" />}
        {busy ? "Adding… (up to a minute)" : "Expand roadmap"}
      </Button>
    </form>
  );
}

export function AdjustGoalForm(props: { journeyId: string; goal: string | null; currentLevel: string; targetLevel: string; pattern: string | null; scopeNotes: string | null }) {
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState(props.goal ?? "");
  const [currentLevel, setCurrent] = useState(props.currentLevel);
  const [targetLevel, setTarget] = useState(props.targetLevel);
  const [pattern, setPattern] = useState<LearningPattern>((props.pattern as LearningPattern) ?? "mixed");
  const [scope, setScope] = useState(props.scopeNotes ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <SlidersHorizontal aria-hidden className="size-4" /> Change goal or difficulty
      </Button>
    );
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await updateJourneyGoal(props.journeyId, {
            goal,
            currentLevel: currentLevel as (typeof CURRENT_LEVELS)[number],
            targetLevel: targetLevel as (typeof TARGET_LEVELS)[number],
            learningPattern: pattern,
            scopeNotes: scope,
          });
          setMsg(r.error ? { kind: "error", text: r.error } : { kind: "success", text: "Saved. Regenerate the roadmap to apply it. Your progress carries over to matching topics." });
        });
      }}
    >
      <div>
        <Label htmlFor="adj-goal">Goal</Label>
        <Textarea id="adj-goal" value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={1000} className="min-h-16" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="adj-cur">Starting level</Label>
          <Select id="adj-cur" value={currentLevel} onChange={(e) => setCurrent(e.target.value)}>
            {CURRENT_LEVELS.map((l) => (
              <option key={l} value={l}>
                {CURRENT_LEVEL_LABEL[l].split(" —")[0]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="adj-target">Target level</Label>
          <Select id="adj-target" value={targetLevel} onChange={(e) => setTarget(e.target.value)}>
            {TARGET_LEVELS.map((l) => (
              <option key={l} value={l}>
                {TARGET_LEVEL_LABEL[l]}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="adj-pattern">Course shape</Label>
        <Select id="adj-pattern" value={pattern} onChange={(e) => setPattern(e.target.value as LearningPattern)}>
          {LEARNING_PATTERNS.map((p) => (
            <option key={p} value={p}>
              {PATTERN_LABEL[p]}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="adj-scope">Scope (optional)</Label>
        <Textarea id="adj-scope" value={scope} onChange={(e) => setScope(e.target.value)} maxLength={1000} className="min-h-16" placeholder="e.g. Focus on hand tools only; skip the history" />
        <Hint>Narrow or widen what the roadmap should cover.</Hint>
      </div>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
    </form>
  );
}
