"use client";

import { useEffect } from "react";
import { Button, ButtonLink, Card } from "@/components/ui";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Card className="text-center">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">
          {error.name === "ConfigurationError"
            ? "The server is missing required configuration. See the setup guide in README.md."
            : "This page hit an unexpected error. Your saved progress is safe."}
        </p>
        {error.digest && <p className="mt-2 text-xs text-muted">Reference: {error.digest}</p>}
        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={reset}>Try again</Button>
          <ButtonLink href="/dashboard" variant="secondary">
            Go home
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
