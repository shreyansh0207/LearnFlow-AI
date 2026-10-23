import type { Metadata } from "next";
import Link from "next/link";
import { Layers } from "lucide-react";
import { FlashcardList, NewCardForm, type FlashcardRow } from "@/components/flashcards";
import { Button, ButtonLink, EmptyState, PageHeader, Select } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { isUuid } from "@/lib/utils";

export const metadata: Metadata = { title: "Flashcards" };

const PAGE_SIZE = 24;

export default async function FlashcardsPage({ searchParams }: { searchParams: Promise<{ journey?: string; page?: string; kind?: string }> }) {
  const sp = await searchParams;
  const { db } = await requireUser("/flashcards");
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const journeyFilter = sp.journey && isUuid(sp.journey) ? sp.journey : null;
  const kindFilter = ["topic", "flashcard", "mistake"].includes(sp.kind ?? "") ? sp.kind! : null;

  // Optional filters are applied with "$n is null or ..." so the query stays fully parameterised.
  const filters = "($1::uuid is null or r.journey_id = $1) and ($2::text is null or r.kind = $2)";
  const [cards, count, journeys] = await Promise.all([
    db.query<FlashcardRow>(
      `select r.id, r.kind, r.source, r.front, r.back, r.due_date, r.interval_days, r.suspended, t.title as "topicTitle"
         from public.review_items r left join public.learning_topics t on t.id = r.topic_id
        where ${filters} order by r.created_at desc limit $3 offset $4`,
      [journeyFilter, kindFilter, PAGE_SIZE, (page - 1) * PAGE_SIZE],
    ),
    db.count(`select count(*)::int as count from public.review_items r where ${filters}`, [journeyFilter, kindFilter]),
    db.query<{ id: string; title: string }>("select id, title from public.learning_journeys order by updated_at desc"),
  ]);
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const qs = (p: number) => {
    const params = new URLSearchParams();
    if (journeyFilter) params.set("journey", journeyFilter);
    if (kindFilter) params.set("kind", kindFilter);
    params.set("page", String(p));
    return `/flashcards?${params.toString()}`;
  };

  return (
    <div>
      <PageHeader title="Flashcards" description={`${count} cards — from lessons, quiz mistakes and your own.`} action={<ButtonLink href="/review" variant="secondary">Review due cards</ButtonLink>} />
      <div className="mb-5 flex flex-wrap items-start gap-3">
        <NewCardForm journeys={journeys} />
        <form className="flex flex-wrap items-center gap-2" action="/flashcards">
          <Select name="journey" defaultValue={journeyFilter ?? ""} aria-label="Filter by journey" className="h-10 w-auto">
            <option value="">All journeys</option>
            {journeys.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </Select>
          <Select name="kind" defaultValue={kindFilter ?? ""} aria-label="Filter by type" className="h-10 w-auto">
            <option value="">All types</option>
            <option value="flashcard">Flashcards</option>
            <option value="topic">Topic recall</option>
            <option value="mistake">Quiz mistakes</option>
          </Select>
          <Button type="submit" variant="secondary" size="sm">
            Filter
          </Button>
        </form>
      </div>
      {cards.length ? (
        <>
          <FlashcardList cards={cards} />
          {totalPages > 1 && (
            <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-3 text-sm">
              {page > 1 ? <Link href={qs(page - 1)} className="text-primary">← Previous</Link> : <span className="text-muted">← Previous</span>}
              <span className="text-muted">
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? <Link href={qs(page + 1)} className="text-primary">Next →</Link> : <span className="text-muted">Next →</span>}
            </nav>
          )}
        </>
      ) : (
        <EmptyState icon={<Layers className="size-6" />} title="No cards yet" description="Cards are created automatically when you complete lessons and when you miss quiz questions. You can also add your own." />
      )}
    </div>
  );
}
