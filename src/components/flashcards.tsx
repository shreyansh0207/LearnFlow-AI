"use client";

import { useState, useTransition } from "react";
import { Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { createCard, deleteCard, setCardSuspended, updateCard } from "@/app/actions/cards";
import { Alert, Badge, Button, Card, Label, Select, Textarea } from "@/components/ui";

export type FlashcardRow = {
  id: string;
  kind: string;
  source: string;
  front: string;
  back: string;
  due_date: string;
  interval_days: number;
  suspended: boolean;
  topicTitle: string | null;
};

export function NewCardForm({ journeys }: { journeys: Array<{ id: string; title: string }> }) {
  const [open, setOpen] = useState(false);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [journeyId, setJourneyId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden className="size-4" /> New card
      </Button>
    );
  }
  return (
    <Card className="w-full space-y-3">
      <div>
        <Label htmlFor="card-front">Front (question)</Label>
        <Textarea id="card-front" value={front} onChange={(e) => setFront(e.target.value)} maxLength={2000} className="min-h-16" />
      </div>
      <div>
        <Label htmlFor="card-back">Back (answer)</Label>
        <Textarea id="card-back" value={back} onChange={(e) => setBack(e.target.value)} maxLength={4000} className="min-h-16" />
      </div>
      {journeys.length > 0 && (
        <div>
          <Label htmlFor="card-journey">Journey (optional)</Label>
          <Select id="card-journey" value={journeyId} onChange={(e) => setJourneyId(e.target.value)}>
            <option value="">None</option>
            {journeys.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </Select>
        </div>
      )}
      {error && <Alert kind="error">{error}</Alert>}
      <div className="flex gap-2">
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await createCard({ front, back, journeyId: journeyId || undefined });
              if (res.error) setError(res.error);
              else {
                setFront("");
                setBack("");
                setError(null);
                setOpen(false);
              }
            })
          }
        >
          Save card
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

function CardItem({ card }: { card: FlashcardRow }) {
  const [editing, setEditing] = useState(false);
  const [showBack, setShowBack] = useState(false);
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
    });

  return (
    <li>
      <Card className={card.suspended ? "p-4 opacity-60" : "p-4"}>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <Badge tone={card.kind === "mistake" ? "warn" : card.source === "user" ? "primary" : "accent"}>
            {card.kind === "mistake" ? "Quiz mistake" : card.kind === "topic" ? "Topic recall" : card.source === "user" ? "Your card" : "From lesson"}
          </Badge>
          {card.topicTitle && <span className="truncate">{card.topicTitle}</span>}
          <span className="ml-auto">{card.suspended ? "Paused" : `Due ${card.due_date}`}</span>
        </div>
        {editing ? (
          <div className="mt-3 space-y-2">
            <Textarea value={front} onChange={(e) => setFront(e.target.value)} aria-label="Front" className="min-h-16" />
            <Textarea value={back} onChange={(e) => setBack(e.target.value)} aria-label="Back" className="min-h-16" />
            <div className="flex gap-2">
              <Button size="sm" disabled={pending} onClick={() => run(async () => {
                const res = await updateCard(card.id, { front, back });
                if (!res.error) setEditing(false);
                return res;
              })}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setShowBack((s) => !s)} className="mt-2 block w-full text-left" aria-expanded={showBack}>
            <p className="text-sm font-medium">{card.front}</p>
            {showBack ? <p className="mt-2 whitespace-pre-wrap border-t border-border pt-2 text-sm text-muted">{card.back}</p> : <p className="mt-1 text-xs text-primary">Tap to show answer</p>}
          </button>
        )}
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        {!editing && (
          <div className="mt-3 flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label="Edit card">
              <Pencil aria-hidden className="size-3.5" />
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setCardSuspended(card.id, !card.suspended))} aria-label={card.suspended ? "Resume card" : "Pause card"}>
              {card.suspended ? <Play aria-hidden className="size-3.5" /> : <Pause aria-hidden className="size-3.5" />}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="hover:bg-danger-soft hover:text-danger"
              disabled={pending}
              onClick={() => confirm("Delete this card and its review history?") && run(() => deleteCard(card.id))}
              aria-label="Delete card"
            >
              <Trash2 aria-hidden className="size-3.5" />
            </Button>
          </div>
        )}
      </Card>
    </li>
  );
}

export function FlashcardList({ cards }: { cards: FlashcardRow[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {cards.map((c) => (
        <CardItem key={c.id} card={c} />
      ))}
    </ul>
  );
}
