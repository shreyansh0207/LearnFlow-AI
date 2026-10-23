import type { Metadata } from "next";
import Link from "next/link";
import { BookmarkCheck, StickyNote } from "lucide-react";
import { NotesPanel, type NoteItem } from "@/components/notes-panel";
import { Card, CardTitle, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatRelative } from "@/lib/learning/dates";

export const metadata: Metadata = { title: "Notes & bookmarks" };

export default async function NotesPage() {
  const { db } = await requireUser("/notes");
  const [noteItems, bookmarks] = await Promise.all([
    db.query<NoteItem>(
      `select n.id, n.body, n.updated_at, t.title as "topicTitle" from public.user_notes n left join public.learning_topics t on t.id = n.topic_id
        order by n.updated_at desc limit 100`,
    ),
    db.query<{ id: string; created_at: string; topic_id: string; topic_title: string | null; journey_title: string | null }>(
      `select b.id, b.created_at, b.topic_id, t.title as topic_title, j.title as journey_title
         from public.bookmarks b left join public.learning_topics t on t.id = b.topic_id left join public.learning_journeys j on j.id = b.journey_id
        order by b.created_at desc limit 100`,
    ),
  ]);

  return (
    <div>
      <PageHeader title="Notes & bookmarks" description="Everything you've saved while learning." />
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardTitle className="flex items-center gap-2">
            <StickyNote aria-hidden className="size-4 text-primary" /> Notes
          </CardTitle>
          <p className="mt-1 text-xs text-muted">Notes written on a lesson are linked to that topic. Notes added here are general.</p>
          <div className="mt-4">
            <NotesPanel topicId={null} notes={noteItems} placeholder="A general note…" />
          </div>
        </Card>
        <div>
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <BookmarkCheck aria-hidden className="size-4 text-primary" /> Bookmarked lessons
          </h2>
          {bookmarks.length ? (
            <ul className="space-y-2">
              {bookmarks.map((b) => (
                <li key={b.id}>
                  <Link href={`/lesson/${b.topic_id}`} className="block rounded-xl border border-border bg-surface p-3 hover:border-primary/40">
                    <p className="text-sm font-medium">{b.topic_title ?? "Lesson"}</p>
                    <p className="text-xs text-muted">
                      {b.journey_title} · saved {formatRelative(b.created_at)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No bookmarks yet" description="Tap “Bookmark” on any lesson to keep it here." />
          )}
        </div>
      </div>
    </div>
  );
}
