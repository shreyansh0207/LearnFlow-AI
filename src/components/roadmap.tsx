"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Check, Circle, CircleCheck, CircleDashed, Flag, LoaderCircle, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { addTopic, moveTopic, removeTopic, renameModule, renameTopic, setTopicKnown, type ActionResult } from "@/app/actions/journey";
import { MasteryBadge } from "@/components/mastery-badge";
import { Alert, Badge, Button, Card, Input } from "@/components/ui";
import type { MasteryStatus } from "@/lib/learning/mastery";
import { cn } from "@/lib/utils";

export type RoadmapModule = {
  id: string;
  level: string;
  title: string;
  description: string | null;
  milestone: string | null;
  topics: Array<{
    id: string;
    title: string;
    summary: string | null;
    estimated_minutes: number;
    is_checkpoint: boolean;
    objectives: string[];
    status: MasteryStatus;
    lessonCompleted: boolean;
    skipped: boolean;
    kind: string;
    sourceCount: number;
    hasSafety: boolean;
  }>;
};

function InlineEdit({ value, onSave, label }: { value: string; onSave: (v: string) => Promise<ActionResult>; label: string }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} aria-label={`Rename ${label}`} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink">
        <Pencil aria-hidden className="size-3.5" />
      </button>
    );
  }
  return (
    <form
      className="flex w-full items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await onSave(text);
          if (res.error) setError(res.error);
          else setEditing(false);
        });
      }}
    >
      <Input value={text} onChange={(e) => setText(e.target.value)} aria-label={`New name for ${label}`} className="h-9" maxLength={200} autoFocus />
      <Button type="submit" size="sm" disabled={pending} aria-label="Save">
        {pending ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Check aria-hidden className="size-4" />}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setEditing(false)} aria-label="Cancel">
        <X aria-hidden className="size-4" />
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </form>
  );
}

function AddTopic({ moduleId }: { moduleId: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} className="text-primary">
        <Plus aria-hidden className="size-4" /> Add topic
      </Button>
    );
  }
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await addTopic(moduleId, text);
          if (res.error) setError(res.error);
          else {
            setText("");
            setOpen(false);
          }
        });
      }}
    >
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="New topic title" aria-label="New topic title" className="h-9" maxLength={200} autoFocus />
      <Button type="submit" size="sm" disabled={pending || !text.trim()}>
        Add
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)} aria-label="Cancel">
        <X aria-hidden className="size-4" />
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </form>
  );
}

export function Roadmap({ modules, editable, nextTopicId }: { modules: RoadmapModule[]; editable: boolean; nextTopicId: string | null }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.error) setError(res.error);
    });

  return (
    <div className="space-y-4">
      {editable && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted">{editing ? "Rename, reorder, add or remove topics." : "Tap a topic to open its lesson."}</p>
          <Button size="sm" variant={editing ? "primary" : "secondary"} onClick={() => setEditing((e) => !e)}>
            {editing ? <Check aria-hidden className="size-4" /> : <Pencil aria-hidden className="size-4" />}
            {editing ? "Done editing" : "Edit roadmap"}
          </Button>
        </div>
      )}
      {error && <Alert kind="error">{error}</Alert>}
      {pending && <p className="sr-only" aria-live="polite">Saving…</p>}

      {modules.map((m, mi) => {
        const done = m.topics.filter((t) => t.lessonCompleted).length;
        return (
          <Card key={m.id} className="p-0">
            <div className="border-b border-border p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="font-medium">Module {mi + 1}</span>
                    <Badge tone="accent" className="capitalize">{m.level}</Badge>
                    <span>
                      {done}/{m.topics.length} studied
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    <h2 className="text-base font-semibold">{m.title}</h2>
                    {editing && <InlineEdit value={m.title} label={`module ${m.title}`} onSave={(v) => renameModule(m.id, v)} />}
                  </div>
                  {m.description && <p className="mt-1 text-sm text-muted">{m.description}</p>}
                </div>
              </div>
              {m.milestone && (
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
                  <Flag aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  <span>
                    <span className="font-medium text-ink">Milestone:</span> {m.milestone}
                  </span>
                </p>
              )}
            </div>
            <ol className="divide-y divide-border">
              {m.topics.map((t, ti) => {
                const isNext = t.id === nextTopicId;
                const Icon = t.lessonCompleted ? CircleCheck : t.skipped ? CircleDashed : Circle;
                return (
                  <li key={t.id} className={cn("flex items-center gap-3 px-4 py-3 sm:px-5", isNext && "bg-primary-soft/60")}>
                    <Icon aria-hidden className={cn("size-5 shrink-0", t.lessonCompleted ? "text-success" : isNext ? "text-primary" : "text-border")} />
                    <div className="min-w-0 flex-1">
                      {editing ? (
                        <div className="flex items-center gap-1">
                          <span className="truncate text-sm font-medium">{t.title}</span>
                          <InlineEdit value={t.title} label={`topic ${t.title}`} onSave={(v) => renameTopic(t.id, v)} />
                        </div>
                      ) : (
                        <Link href={`/lesson/${t.id}`} className="block rounded-lg focus-visible:outline-offset-4">
                          <span className="text-sm font-medium hover:text-primary">{t.title}</span>
                        </Link>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <span>{t.estimated_minutes} min</span>
                        {t.kind === "project" && <Badge tone="primary">Project</Badge>}
                        {t.kind === "skill_practice" && <Badge tone="primary">Practice</Badge>}
                        {t.is_checkpoint && <Badge tone="accent">Checkpoint</Badge>}
                        {t.hasSafety && <Badge tone="warn">Safety note</Badge>}
                        {t.sourceCount > 0 && <span title="Topics citing retrieved sources">{t.sourceCount} source{t.sourceCount === 1 ? "" : "s"}</span>}
                        {t.skipped && !t.lessonCompleted && <Badge>Already known</Badge>}
                        {isNext && <Badge tone="primary">Up next</Badge>}
                        <MasteryBadge status={t.status} short />
                      </div>
                    </div>
                    {!editing && !t.lessonCompleted && (
                      <button
                        type="button"
                        onClick={() => run(() => setTopicKnown(t.id, !t.skipped))}
                        className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-muted hover:bg-surface-2 hover:text-ink"
                        aria-label={t.skipped ? `Undo: I know ${t.title}` : `I already know ${t.title}`}
                      >
                        {t.skipped ? "Undo" : "I know this"}
                      </button>
                    )}
                    {editing && (
                      <div className="flex shrink-0 items-center">
                        <button type="button" disabled={ti === 0} onClick={() => run(() => moveTopic(t.id, "up"))} aria-label={`Move ${t.title} up`} className="rounded-lg p-2 text-muted hover:bg-surface-2 disabled:opacity-30">
                          <ArrowUp aria-hidden className="size-4" />
                        </button>
                        <button
                          type="button"
                          disabled={ti === m.topics.length - 1}
                          onClick={() => run(() => moveTopic(t.id, "down"))}
                          aria-label={`Move ${t.title} down`}
                          className="rounded-lg p-2 text-muted hover:bg-surface-2 disabled:opacity-30"
                        >
                          <ArrowDown aria-hidden className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Remove “${t.title}” from your roadmap?`)) run(() => removeTopic(t.id));
                          }}
                          aria-label={`Remove ${t.title}`}
                          className="rounded-lg p-2 text-muted hover:bg-danger-soft hover:text-danger"
                        >
                          <Trash2 aria-hidden className="size-4" />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            {editing && (
              <div className="border-t border-border px-3 py-2">
                <AddTopic moduleId={m.id} />
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

export function GenerateCurriculumButton({ journeyId, label = "Generate roadmap", variant = "primary", confirmText }: { journeyId: string; label?: string; variant?: "primary" | "secondary"; confirmText?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        variant={variant}
        disabled={busy}
        onClick={async () => {
          if (confirmText && !confirm(confirmText)) return;
          setBusy(true);
          setError(null);
          try {
            const res = await fetch(`/api/journeys/${journeyId}/curriculum`, { method: "POST" });
            const data = await res.json().catch(() => null);
            if (!res.ok) setError(data?.error?.message ?? "Generation failed. Please try again.");
            else router.replace(`/journeys/${journeyId}`);
            router.refresh();
          } catch {
            setError("You appear to be offline. Generating a roadmap needs a connection.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <RefreshCw aria-hidden className="size-4" />}
        {busy ? "Generating… (up to a minute)" : label}
      </Button>
      {error && <Alert kind="error">{error}</Alert>}
    </div>
  );
}
