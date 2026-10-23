"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";
import { Alert, Button, Card } from "@/components/ui";

/** Generates the lesson on first visit, then refreshes the server page to render it. */
export function LessonGenerator({ topicId, variant, topicTitle, autoStart }: { topicId: string; variant: "standard" | "simpler"; topicTitle: string; autoStart: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "error">(autoStart ? "busy" : "idle");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const generate = useCallback(async () => {
    setState("busy");
    setError(null);
    try {
      const res = await fetch(`/api/lessons/${topicId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variant }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error?.message ?? "Could not prepare the lesson.");
        setState("error");
        return;
      }
      router.refresh();
    } catch {
      setError("You appear to be offline. New lessons need a connection — lessons you saved for offline are on the offline screen.");
      setState("error");
    }
  }, [router, topicId, variant]);

  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true;
      void generate();
    }
  }, [autoStart, generate]);

  return (
    <Card className="flex flex-col items-center px-6 py-12 text-center" aria-live="polite">
      <div className="brand-gradient flex size-12 items-center justify-center rounded-2xl text-white">
        <Sparkles aria-hidden className="size-5" />
      </div>
      {state === "busy" ? (
        <>
          <h2 className="mt-4 font-semibold">Preparing your lesson on “{topicTitle}”…</h2>
          <p className="mt-1 max-w-sm text-sm text-muted">
            {variant === "simpler" ? "Writing a simpler explanation with extra examples." : "Tailoring it to your level and what you've already learned."} This usually takes 20–60 seconds.
          </p>
          <LoaderCircle aria-hidden className="mt-5 size-6 animate-spin text-primary" />
        </>
      ) : (
        <>
          <h2 className="mt-4 font-semibold">{state === "error" ? "The lesson couldn't be prepared" : "Ready when you are"}</h2>
          {error && <Alert kind="error" className="mt-3 text-left">{error}</Alert>}
          <Button className="mt-5" onClick={generate}>
            {state === "error" ? "Try again" : "Generate lesson"}
          </Button>
        </>
      )}
    </Card>
  );
}
