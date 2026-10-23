"use client";

import { useState, useTransition } from "react";
import { Archive, Pause, Play, Trash2 } from "lucide-react";
import { deleteJourney, setJourneyStatus, startJourney } from "@/app/actions/journey";
import { Alert, Button } from "@/components/ui";

export function StartJourneyButton({ journeyId, label = "Start learning" }: { journeyId: string; label?: string }) {
  const [pending, start] = useTransition();
  return (
    <Button size="lg" disabled={pending} onClick={() => start(async () => void (await startJourney(journeyId)))}>
      <Play aria-hidden className="size-4" /> {pending ? "Opening…" : label}
    </Button>
  );
}

export function JourneyControls({ journeyId, status }: { journeyId: string; status: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const act = (fn: () => Promise<{ error?: string } | void>) =>
    start(async () => {
      const res = await fn();
      if (res && "error" in res && res.error) setError(res.error);
    });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === "paused" || status === "archived" ? (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => act(() => setJourneyStatus(journeyId, "active"))}>
            <Play aria-hidden className="size-4" /> Resume journey
          </Button>
        ) : (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => act(() => setJourneyStatus(journeyId, "paused"))}>
            <Pause aria-hidden className="size-4" /> Pause
          </Button>
        )}
        {status !== "archived" && (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => act(() => setJourneyStatus(journeyId, "archived"))}>
            <Archive aria-hidden className="size-4" /> Archive
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="text-danger hover:bg-danger-soft"
          disabled={pending}
          onClick={() => {
            if (confirm("Delete this journey permanently? Its lessons, quiz history, reviews and notes will be deleted. This cannot be undone.")) {
              act(() => deleteJourney(journeyId));
            }
          }}
        >
          <Trash2 aria-hidden className="size-4" /> Delete
        </Button>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
    </div>
  );
}
