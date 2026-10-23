"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, CircleHelp, LoaderCircle, Search, Sparkles } from "lucide-react";
import { Alert, Badge, Button, ButtonLink, Card, Input, SourceBadge } from "@/components/ui";
import type { TopicProposal } from "@/lib/catalog/schemas";
import type { SourceDoc } from "@/lib/sources/types";

const EXAMPLES = [
  "I want to understand how the universe began",
  "Teach me traditional Japanese woodworking",
  "How semiconductor fabrication works",
  "Negotiation from beginner to expert",
  "The mathematics behind modern cryptography",
  "Underwater photography",
  "History of ancient trade routes",
  "How a commercial aircraft engine works",
];

type Hit = { id: string; name: string; path: string; kind: string; status: string; origin: string; description: string | null };

type Result =
  | { type: "clarify"; question: string; options: string[] }
  | { type: "rejected"; message: string }
  | { type: "not_found"; message: string; alternatives: Hit[]; interpretation: { topic: string; goalSummary: string } }
  | { type: "proposal_preview"; proposal: TopicProposal; source: "ai" | "demo"; sources: SourceDoc[]; reason: string; alternatives: Hit[]; interpretation: { topic: string; goalSummary: string; learningPattern: string } };

const STAGES = ["Understanding your goal…", "Searching the knowledge catalog…", "Mapping prerequisites and branches…", "Checking for duplicates and gaps…"];

export function DiscoveryPanel({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [suggested, setSuggested] = useState<string | null>(null);

  async function discover(q: string, clarification?: string) {
    if (q.trim().length < 2 || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setStage(0);
    const timer = window.setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 4000);
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, clarification: clarification ?? null }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error?.message ?? "Discovery failed. Nothing was saved. Please try again.");
        return;
      }
      if (data.type === "matched" || data.type === "explore" || data.type === "proposed") {
        const qs = new URLSearchParams({ goal: data.interpretation?.goalSummary ?? q });
        if (data.type === "proposed") qs.set("new", data.created ? "1" : "0");
        if (data.interpretation?.learningPattern) qs.set("pattern", data.interpretation.learningPattern);
        router.push(`/topics/${data.nodeId}?${qs.toString()}`);
        return;
      }
      setResult(data as Result);
    } catch {
      setError("You appear to be offline. Discovery needs a connection.");
    } finally {
      window.clearInterval(timer);
      setBusy(false);
    }
  }

  async function suggest(name: string) {
    const res = await fetch("/api/catalog/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.nodeId) router.push(`/topics/${data.nodeId}`);
    else setSuggested(data?.error?.message ?? "Couldn't save the suggestion.");
  }

  const journeyHref = (subject: string, goal: string, pattern?: string) =>
    `/journeys/new?${new URLSearchParams({ subject: subject.slice(0, 160), goal: goal.slice(0, 1000), ...(pattern ? { pattern } : {}) }).toString()}`;

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void discover(query);
        }}
        role="search"
        className="relative"
      >
        <label htmlFor="discover-input" className="sr-only">
          What do you want to learn?
        </label>
        <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
        <Input
          id="discover-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Any subject, skill, profession, hobby or question…"
          maxLength={300}
          className="h-14 rounded-2xl pl-12 pr-28 text-base shadow-sm"
          autoComplete="off"
        />
        <Button type="submit" disabled={busy || query.trim().length < 2} className="absolute right-2 top-1/2 h-10 -translate-y-1/2">
          {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Sparkles aria-hidden className="size-4" />}
          <span className="hidden sm:inline">Find my path</span>
          <span className="sm:hidden">Go</span>
        </Button>
      </form>

      {!busy && !result && (
        <div className="flex flex-wrap gap-2" aria-label="Examples">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setQuery(ex);
                void discover(ex);
              }}
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-left text-xs text-muted hover:border-primary hover:text-ink sm:text-sm"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {busy && (
        <Card className="flex items-center gap-3" aria-live="polite">
          <LoaderCircle aria-hidden className="size-5 shrink-0 animate-spin text-primary" />
          <div>
            <p className="text-sm font-medium">{STAGES[stage]}</p>
            <p className="text-xs text-muted">New topics can take up to a minute while we build and check a structure.</p>
          </div>
        </Card>
      )}

      {error && <Alert kind="error">{error}</Alert>}

      {result?.type === "clarify" && (
        <Card className="space-y-3" aria-live="polite">
          <p className="flex items-start gap-2 font-medium">
            <CircleHelp aria-hidden className="mt-0.5 size-5 shrink-0 text-accent" /> {result.question}
          </p>
          <div className="flex flex-wrap gap-2">
            {result.options.map((o) => (
              <Button key={o} variant="secondary" size="sm" onClick={() => discover(query, o)}>
                {o}
              </Button>
            ))}
          </div>
        </Card>
      )}

      {result?.type === "rejected" && <Alert kind="warn">{result.message}</Alert>}

      {result?.type === "not_found" && (
        <Card className="space-y-3">
          <p className="font-medium">“{result.interpretation.topic}” isn&apos;t in the catalog yet.</p>
          <p className="text-sm text-muted">{result.message}</p>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={journeyHref(result.interpretation.topic, result.interpretation.goalSummary)}>
              Create a journey for it <ArrowRight aria-hidden className="size-4" />
            </ButtonLink>
            <Button variant="secondary" onClick={() => suggest(result.interpretation.topic)}>
              Suggest it for the catalog
            </Button>
          </div>
          {suggested && <p className="text-sm text-muted">{suggested}</p>}
          <Alternatives hits={result.alternatives} />
        </Card>
      )}

      {result?.type === "proposal_preview" && (
        <Card className="space-y-4" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{result.proposal.name}</h2>
            <SourceBadge source={result.source} />
            <Badge tone="warn">Not saved to the catalog</Badge>
          </div>
          <p className="text-sm text-muted">{result.proposal.description}</p>
          {result.proposal.prerequisites.length > 0 && (
            <div>
              <p className="text-sm font-medium">You&apos;ll need first</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-muted">
                {result.proposal.prerequisites.map((p) => (
                  <li key={p.name}>
                    <span className="text-ink">{p.name}</span> — {p.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.proposal.subtopics.length > 0 && (
            <div>
              <p className="text-sm font-medium">Main branches</p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {result.proposal.subtopics.map((s) => (
                  <li key={s.name}>
                    <Badge>{s.name}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.sources.length > 0 && (
            <p className="text-xs text-muted">
              Informed by {result.sources.length} retrieved source(s): {result.sources.map((s) => s.provider).filter((v, i, a) => a.indexOf(v) === i).join(", ")}.
            </p>
          )}
          <p className="text-xs text-muted">
            {result.reason === "demo" ? "Demo mode: template structure, not AI-generated." : "Saving new topics to the shared catalog isn't enabled on this server, so this proposal is shown only to you."}
          </p>
          <ButtonLink href={journeyHref(result.proposal.name, result.interpretation.goalSummary, result.proposal.learningPattern)}>
            Start a journey on this <ArrowRight aria-hidden className="size-4" />
          </ButtonLink>
          <Alternatives hits={result.alternatives} />
        </Card>
      )}
    </div>
  );
}

function Alternatives({ hits }: { hits: Hit[] }) {
  if (!hits.length) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted">Related topics already in the catalog</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {hits.map((h) => (
          <li key={h.id}>
            <Link href={`/topics/${h.id}`} className="inline-flex rounded-full border border-border px-2.5 py-1 text-xs hover:border-primary">
              {h.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
