"use client";

import { useState, useTransition } from "react";
import { createCuratedNode, importNodes, mergeNodes, setNodeStatus, setRequestStatus, type AdminResult } from "@/app/actions/catalog-admin";
import { Alert, Button, Hint, Input, Label, Select, Textarea } from "@/components/ui";
import { DIFFICULTIES } from "@/lib/catalog/schemas";
import { LEARNING_PATTERNS, PATTERN_LABEL } from "@/lib/catalog/patterns";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
/** Accepts a raw id or a pasted /topics/<id> URL. */
const extractId = (s: string) => UUID.exec(s)?.[0] ?? "";

function useAction() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);
  const run = (fn: () => Promise<AdminResult>) => start(async () => setResult(await fn()));
  const feedback = result ? <Alert kind={result.error ? "error" : "success"}>{result.error ?? result.message ?? "Done."}</Alert> : null;
  return { pending, run, feedback };
}

export function ReviewActions({ id }: { id: string }) {
  const { pending, run, feedback } = useAction();
  const [mergeTarget, setMergeTarget] = useState("");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" disabled={pending} onClick={() => run(() => setNodeStatus(id, "verified"))}>
          Verify
        </Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => setNodeStatus(id, "reviewed"))}>
          Mark reviewed
        </Button>
        <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft" disabled={pending} onClick={() => run(() => setNodeStatus(id, "rejected"))}>
          Reject
        </Button>
      </div>
      <form
        className="flex flex-wrap gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const target = extractId(mergeTarget);
          if (target && confirm("Merge this topic into the target? Its children, links, sources and learner journeys move to the target.")) run(() => mergeNodes(id, target));
        }}
      >
        <Input value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)} placeholder="Merge into: paste topic URL or id" aria-label="Merge target" className="h-9 max-w-72 text-sm" />
        <Button type="submit" size="sm" variant="secondary" disabled={pending || !extractId(mergeTarget)}>
          Merge
        </Button>
      </form>
      {feedback}
    </div>
  );
}

export function RequestActions({ id }: { id: number }) {
  const { pending, run, feedback } = useAction();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => setRequestStatus(id, "resolved"))}>
        Resolved
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setRequestStatus(id, "ignored"))}>
        Ignore
      </Button>
      {feedback}
    </div>
  );
}

export function CreateNodeForm() {
  const { pending, run, feedback } = useAction();
  const [f, setF] = useState({ parent: "", name: "", aliases: "", description: "", kind: "topic", difficulty: "", pattern: "" });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() =>
          createCuratedNode({
            parentId: extractId(f.parent),
            name: f.name,
            aliases: f.aliases,
            description: f.description,
            kind: f.kind as "topic",
            difficulty: f.difficulty as "",
            pattern: f.pattern as "",
          }),
        );
      }}
    >
      <div>
        <Label htmlFor="cn-parent">Parent topic</Label>
        <Input id="cn-parent" value={f.parent} onChange={(e) => set("parent", e.target.value)} placeholder="Paste the parent's /topics/… URL or id" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="cn-name">Name</Label>
          <Input id="cn-name" value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={200} />
        </div>
        <div>
          <Label htmlFor="cn-aliases">Aliases (comma-separated)</Label>
          <Input id="cn-aliases" value={f.aliases} onChange={(e) => set("aliases", e.target.value)} />
        </div>
      </div>
      <div>
        <Label htmlFor="cn-desc">Description</Label>
        <Textarea id="cn-desc" value={f.description} onChange={(e) => set("description", e.target.value)} maxLength={4000} className="min-h-16" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="cn-kind">Kind</Label>
          <Select id="cn-kind" value={f.kind} onChange={(e) => set("kind", e.target.value)}>
            {["discipline", "subject", "subdiscipline", "topic", "subtopic", "concept", "skill", "field"].map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="cn-diff">Difficulty</Label>
          <Select id="cn-diff" value={f.difficulty} onChange={(e) => set("difficulty", e.target.value)}>
            <option value="">—</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="cn-pattern">Course shape</Label>
          <Select id="cn-pattern" value={f.pattern} onChange={(e) => set("pattern", e.target.value)}>
            <option value="">—</option>
            {LEARNING_PATTERNS.map((p) => (
              <option key={p} value={p}>
                {PATTERN_LABEL[p]}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {feedback}
      <Button type="submit" disabled={pending || !extractId(f.parent) || f.name.trim().length < 2}>
        Add curated topic
      </Button>
    </form>
  );
}

const IMPORT_EXAMPLE = `[
  { "name": "Japanese joinery", "aliases": ["Sashimono"], "kind": "subject",
    "children": [ { "name": "Kanna (hand plane) technique", "kind": "skill" } ] }
]`;

export function ImportForm() {
  const { pending, run, feedback } = useAction();
  const [parent, setParent] = useState("");
  const [json, setJson] = useState("");
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => importNodes(extractId(parent), json));
      }}
    >
      <div>
        <Label htmlFor="im-parent">Import under</Label>
        <Input id="im-parent" value={parent} onChange={(e) => setParent(e.target.value)} placeholder="Paste the parent's /topics/… URL or id" />
      </div>
      <div>
        <Label htmlFor="im-json">JSON tree</Label>
        <Textarea id="im-json" value={json} onChange={(e) => setJson(e.target.value)} placeholder={IMPORT_EXAMPLE} className="min-h-40 font-mono text-xs" />
        <Hint>Up to 200 top-level items (500 total). Duplicates by name or alias are reused, not re-created. Imported topics are marked “imported · reviewed”.</Hint>
      </div>
      {feedback}
      <Button type="submit" disabled={pending || !extractId(parent) || json.trim().length < 2}>
        Import
      </Button>
    </form>
  );
}
