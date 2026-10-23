"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ListChecks, LoaderCircle } from "lucide-react";
import { Alert, Button, Card } from "@/components/ui";

/** Requests a new quiz from the server, then refreshes the page to render it. */
export function QuizStarter({
  endpoint,
  body,
  title,
  description,
  autoStart = true,
  redirectTo,
}: {
  endpoint: string;
  body: Record<string, unknown>;
  title: string;
  description: string;
  autoStart?: boolean;
  /** Where to go once the quiz exists (drops one-shot params like ?new=1). */
  redirectTo?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(autoStart);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error?.message ?? "Could not create the quiz.");
        setBusy(false);
        return;
      }
      if (redirectTo) router.replace(redirectTo);
      router.refresh();
    } catch {
      setError("You appear to be offline. Quizzes need a connection.");
      setBusy(false);
    }
  }, [endpoint, body, router, redirectTo]);

  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true;
      void start();
    }
  }, [autoStart, start]);

  return (
    <Card className="flex flex-col items-center px-6 py-12 text-center" aria-live="polite">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <ListChecks aria-hidden className="size-6" />
      </div>
      <h2 className="mt-4 font-semibold">{busy ? `Writing your ${title.toLowerCase()}…` : title}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted">{busy ? "Questions are tailored to this topic and your past answers. About 15–40 seconds." : description}</p>
      {busy ? (
        <LoaderCircle aria-hidden className="mt-5 size-6 animate-spin text-primary" />
      ) : (
        <>
          {error && <Alert kind="error" className="mt-4 text-left">{error}</Alert>}
          <Button className="mt-5" onClick={start}>
            {error ? "Try again" : "Start"}
          </Button>
        </>
      )}
    </Card>
  );
}
