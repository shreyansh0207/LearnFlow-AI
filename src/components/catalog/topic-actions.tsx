"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GitBranchPlus, LoaderCircle, Plus } from "lucide-react";
import { Alert, Button, Input } from "@/components/ui";

export function ExpandBranchesButton({ nodeId, label = "Map more branches" }: { nodeId: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  return (
    <div className="space-y-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            const res = await fetch(`/api/catalog/nodes/${nodeId}/expand`, { method: "POST" });
            const data = await res.json().catch(() => null);
            if (!res.ok) setMsg({ kind: "error", text: data?.error?.message ?? "Couldn't map branches. Nothing was saved." });
            else {
              setMsg({ kind: "success", text: data.added ? `Added ${data.added} branch(es). They're marked as unreviewed.` : "No new branches were needed." });
              router.refresh();
            }
          } catch {
            setMsg({ kind: "error", text: "You appear to be offline." });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <GitBranchPlus aria-hidden className="size-4" />}
        {busy ? "Mapping branches…" : label}
      </Button>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
    </div>
  );
}

export function SuggestSubtopic({ parentId }: { parentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return (
      <Button size="sm" variant="ghost" className="text-primary" onClick={() => setOpen(true)}>
        <Plus aria-hidden className="size-4" /> Suggest a subtopic
      </Button>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch("/api/catalog/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, parentId }) });
        const data = await res.json().catch(() => null);
        setBusy(false);
        if (!res.ok) setError(data?.error?.message ?? "Couldn't save the suggestion.");
        else {
          setName("");
          setOpen(false);
          if (data.created === false) router.push(`/topics/${data.nodeId}`);
          else router.refresh();
        }
      }}
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Subtopic name" aria-label="Subtopic name" maxLength={120} className="h-9 max-w-64" autoFocus />
      <Button type="submit" size="sm" disabled={busy || name.trim().length < 2}>
        Suggest
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {error && <p className="w-full text-xs text-danger">{error}</p>}
    </form>
  );
}
