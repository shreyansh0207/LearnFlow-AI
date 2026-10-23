"use client";

import Link from "next/link";
import { useState } from "react";
import { CircleCheck, Eye, PartyPopper } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { Alert, Badge, Button, ButtonLink, Card, ProgressBar } from "@/components/ui";
import { postOrQueue } from "@/lib/offline-queue";
import { RATING_LABEL, schedule, type Rating } from "@/lib/learning/spaced-repetition";
import { cn } from "@/lib/utils";

export type ReviewCard = {
  id: string;
  kind: "topic" | "flashcard" | "mistake";
  front: string;
  back: string;
  interval_days: number;
  ease: number;
  repetitions: number;
  lapses: number;
  due_date: string;
  topicTitle: string | null;
  topicId: string | null;
};

const KIND_LABEL = { topic: "Recall", flashcard: "Flashcard", mistake: "From a quiz mistake" } as const;
const RATING_STYLE: Record<Rating, string> = {
  again: "border-danger/40 hover:bg-danger-soft",
  hard: "border-warn/40 hover:bg-warn-soft",
  good: "border-primary/40 hover:bg-primary-soft",
  easy: "border-success/40 hover:bg-success-soft",
};

function intervalText(days: number) {
  if (days <= 1) return "1 day";
  if (days < 30) return `${days} days`;
  const months = Math.round(days / 30);
  return `${months} mo`;
}

export function ReviewSession({ cards, today, overflow }: { cards: ReviewCard[]; today: string; overflow: number }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(0);
  const [tally, setTally] = useState<Record<Rating, number>>({ again: 0, hard: 0, good: 0, easy: 0 });

  const card = cards[index];
  const done = index >= cards.length;

  async function rate(rating: Rating) {
    if (!card) return;
    setBusy(true);
    setError(null);
    try {
      const res = await postOrQueue("/api/review", { id: crypto.randomUUID(), itemId: card.id, rating, occurredAt: new Date().toISOString() });
      if (res.status === "queued") setQueued((q) => q + 1);
      setTally((t) => ({ ...t, [rating]: t[rating] + 1 }));
      setRevealed(false);
      setIndex((i) => i + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that rating.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const total = Object.values(tally).reduce((a, b) => a + b, 0);
    return (
      <Card className="flex flex-col items-center px-6 py-10 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-success-soft text-success">
          <PartyPopper aria-hidden className="size-6" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">Today&apos;s reviews are done</h2>
        <p className="mt-1 text-sm text-muted">
          {total} reviewed · {tally.again} to relearn · {tally.good + tally.easy} remembered well
        </p>
        {queued > 0 && <Alert kind="info" className="mt-4 text-left">{queued} ratings were saved on this device and will sync when you&apos;re back online.</Alert>}
        {overflow > 0 && <p className="mt-3 text-sm text-muted">{overflow} more cards are waiting. They&apos;ll be spread over the next few days so you never face a wall of reviews.</p>}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <ButtonLink href="/learn">Continue learning</ButtonLink>
          <ButtonLink href="/dashboard" variant="secondary">
            Home
          </ButtonLink>
        </div>
      </Card>
    );
  }

  const state = { intervalDays: card.interval_days, ease: Number(card.ease), repetitions: card.repetitions, lapses: card.lapses };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-muted">
        <span>
          Card {index + 1} of {cards.length}
        </span>
        {card.due_date < today && <Badge tone="warn">Overdue</Badge>}
      </div>
      <ProgressBar value={index / cards.length} label="Review progress" />

      <Card className="min-h-64 p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <Badge tone={card.kind === "mistake" ? "warn" : "accent"}>{KIND_LABEL[card.kind]}</Badge>
          {card.topicTitle && card.topicId && (
            <Link href={`/lesson/${card.topicId}`} className="truncate hover:text-ink">
              {card.topicTitle}
            </Link>
          )}
        </div>
        <div className="mt-4 text-lg font-medium leading-relaxed">{card.front}</div>
        {revealed ? (
          <div className="mt-5 animate-fade-up border-t border-border pt-5">
            <Markdown text={card.back} className="text-[15px]" />
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted">Try to recall the answer before revealing it.</p>
        )}
      </Card>

      {error && <Alert kind="error">{error}</Alert>}

      {revealed ? (
        <div>
          <p className="mb-2 text-center text-sm text-muted">How well did you remember?</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["again", "hard", "good", "easy"] as Rating[]).map((r) => (
              <button
                key={r}
                type="button"
                disabled={busy}
                onClick={() => rate(r)}
                className={cn("flex min-h-14 flex-col items-center justify-center rounded-xl border bg-surface px-2 py-2 text-sm font-medium transition-colors disabled:opacity-50", RATING_STYLE[r])}
              >
                {RATING_LABEL[r]}
                <span className="text-[11px] font-normal text-muted">{intervalText(schedule(state, r, today).intervalDays)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <Button size="lg" className="w-full" onClick={() => setRevealed(true)}>
          <Eye aria-hidden className="size-4" /> Show answer
        </Button>
      )}
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted">
        <CircleCheck aria-hidden className="size-3.5" /> Ratings sync automatically, even if your connection drops.
      </p>
    </div>
  );
}
