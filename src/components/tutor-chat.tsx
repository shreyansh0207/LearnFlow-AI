"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Send, Sparkles } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { Alert, Button, SourceBadge, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";

export type ChatMessage = { id: string; role: "user" | "assistant"; content: string; source?: string };

const STARTERS = ["Explain the last thing I learned in simpler terms", "Quiz me with one question", "What should I focus on next?", "Give me a real-life example"];

export function TutorChat({ initial, journeyId, topicId, topicTitle }: { initial: ChatMessage[]; journeyId: string | null; topicId: string | null; topicTitle: string | null }) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function send(content: string) {
    const message = content.trim();
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    const optimistic: ChatMessage = { id: `local-${nextId.current++}`, role: "user", content: message };
    setMessages((m) => [...m, optimistic]);
    setText("");
    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, journeyId, topicId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? "The tutor couldn't answer right now.");
      setMessages((m) => [...m, { id: `reply-${nextId.current++}`, role: "assistant", content: data.reply, source: data.source }]);
    } catch (e) {
      // Restore the draft so nothing the learner typed is lost.
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      setText(message);
      setError(e instanceof TypeError ? "You appear to be offline. The tutor needs a connection." : e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[60dvh] flex-col">
      <div className="flex-1 space-y-4 pb-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center">
            <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Sparkles aria-hidden className="size-5" />
            </div>
            <p className="mt-3 font-medium">Ask anything{topicTitle ? ` about “${topicTitle}”` : ""}</p>
            <p className="mt-1 text-sm text-muted">Your tutor can see your learning history, so its help fits where you are.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {STARTERS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-border px-3 py-1.5 text-sm text-muted hover:border-primary hover:text-ink">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[88%] rounded-2xl px-4 py-2.5 text-[15px]", m.role === "user" ? "rounded-br-md bg-primary text-primary-ink" : "rounded-bl-md border border-border bg-surface")}>
              {m.role === "assistant" ? (
                <>
                  {m.source === "demo" && <SourceBadge source="demo" />}
                  <Markdown text={m.content} />
                </>
              ) : (
                <p className="whitespace-pre-wrap">{m.content}</p>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <LoaderCircle aria-hidden className="size-4 animate-spin" /> Thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] rounded-2xl border border-border bg-surface p-2 shadow-lg lg:bottom-4">
        {error && <Alert kind="error" className="mb-2">{error}</Alert>}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(text);
              }
            }}
            placeholder="Ask your tutor…"
            aria-label="Message the tutor"
            maxLength={4000}
            rows={1}
            className="min-h-11 resize-none border-0 focus:ring-0"
          />
          <Button type="submit" disabled={busy || !text.trim()} aria-label="Send" className="shrink-0">
            <Send aria-hidden className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
