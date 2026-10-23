import type { Metadata } from "next";
import Link from "next/link";
import { AIStatusNotice } from "@/components/ai-status";
import { TutorChat, type ChatMessage } from "@/components/tutor-chat";
import { Button, Select } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getTopicContext } from "@/lib/data";
import { isUuid } from "@/lib/utils";

export const metadata: Metadata = { title: "AI Tutor" };

export default async function TutorPage({ searchParams }: { searchParams: Promise<{ journey?: string; topic?: string }> }) {
  const sp = await searchParams;
  const { db } = await requireUser("/tutor");

  let journeyId = sp.journey && isUuid(sp.journey) ? sp.journey : null;
  let topic: { id: string; title: string } | null = null;
  if (sp.topic && isUuid(sp.topic)) {
    const ctx = await getTopicContext(db, sp.topic);
    if (ctx) {
      topic = { id: ctx.topic.id, title: ctx.topic.title };
      journeyId = ctx.journey.id;
    }
  }

  const [journeys, past] = await Promise.all([
    db.query<{ id: string; title: string }>("select id, title from public.learning_journeys where status <> 'archived' order by last_studied_at desc nulls last"),
    db.query<ChatMessage>("select id, role, content from public.tutor_messages where journey_id is not distinct from $1 order by created_at desc limit 40", [journeyId]),
  ]);
  const initial = past.reverse();
  const activeJourney = journeys.find((j) => j.id === journeyId);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI Tutor</h1>
          <p className="mt-1 text-sm text-muted">
            {topic ? (
              <>
                Discussing <Link href={`/lesson/${topic.id}`} className="font-medium text-ink underline">{topic.title}</Link>
              </>
            ) : activeJourney ? (
              <>Conversation for {activeJourney.title}</>
            ) : (
              "General questions — pick a journey for personalised help."
            )}
          </p>
        </div>
        <form action="/tutor" className="flex items-center gap-2">
          <Select name="journey" defaultValue={journeyId ?? ""} aria-label="Conversation" className="h-10 w-auto max-w-56">
            <option value="">General</option>
            {journeys.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </Select>
          <Button type="submit" size="sm" variant="secondary">
            Switch
          </Button>
        </form>
      </div>
      <AIStatusNotice className="mb-4" />
      <TutorChat key={`${journeyId ?? "general"}-${topic?.id ?? ""}`} initial={initial} journeyId={journeyId} topicId={topic?.id ?? null} topicTitle={topic?.title ?? null} />
      <p className="mt-3 text-center text-xs text-muted">AI can make mistakes. For finance, legal or medical decisions, consult a qualified professional.</p>
    </div>
  );
}
