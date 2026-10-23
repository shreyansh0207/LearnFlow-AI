import type { Metadata } from "next";
import Link from "next/link";
import { DomainIcon, ProvenanceBadge } from "@/components/catalog/badges";
import { DiscoveryPanel } from "@/components/catalog/discovery-panel";
import { AIStatusNotice } from "@/components/ai-status";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listDomains, searchCatalog } from "@/lib/catalog/repository";

export const metadata: Metadata = { title: "Explore" };

const PAGE = 20;

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const sp = await searchParams;
  const { db } = await requireUser("/explore");
  const q = (sp.q ?? "").trim().slice(0, 200);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const [domains, hits] = await Promise.all([listDomains(db), q.length >= 2 ? searchCatalog(db, q, { limit: PAGE + 1, offset: (page - 1) * PAGE }) : Promise.resolve([])]);
  const hasMore = hits.length > PAGE;

  return (
    <div className="space-y-8">
      <section className="mx-auto max-w-3xl text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          What do you want to <span className="text-gradient">learn</span>?
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted">
          Type a subject, a skill, a profession, a hobby or a question. If it&apos;s not in our catalog yet, LearnFlow maps it out: prerequisites, branches and a path that fits you.
        </p>
        <div className="mt-6 text-left">
          <DiscoveryPanel initialQuery={q} />
        </div>
        <AIStatusNotice className="mt-4 text-left" />
      </section>

      {q.length >= 2 && (
        <section aria-labelledby="catalog-results">
          <h2 id="catalog-results" className="mb-3 font-semibold">
            In the catalog for “{q}”
          </h2>
          {hits.length ? (
            <>
              <ul className="grid gap-2 sm:grid-cols-2">
                {hits.slice(0, PAGE).map((h) => (
                  <li key={h.id}>
                    <Link href={`/topics/${h.id}`} className="block h-full rounded-xl border border-border bg-surface p-3 hover:border-primary/40">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{h.name}</span>
                        <ProvenanceBadge origin={h.origin} status={h.status} />
                      </div>
                      <p className="mt-0.5 truncate text-xs capitalize text-muted">
                        {h.kind} · {h.path.split("/").slice(0, -1).join(" › ").replace(/-/g, " ") || "domain"}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
              <nav aria-label="Pagination" className="mt-4 flex justify-center gap-4 text-sm">
                {page > 1 && <Link className="text-primary" href={`/explore?q=${encodeURIComponent(q)}&page=${page - 1}`}>← Previous</Link>}
                {hasMore && <Link className="text-primary" href={`/explore?q=${encodeURIComponent(q)}&page=${page + 1}`}>More results →</Link>}
              </nav>
            </>
          ) : (
            <p className="text-sm text-muted">No catalog entries match yet. Use “Find my path” above and LearnFlow will map it out.</p>
          )}
        </section>
      )}

      <section aria-labelledby="domains">
        <div className="mb-3 flex items-end justify-between">
          <h2 id="domains" className="font-semibold">
            Browse knowledge domains
          </h2>
          <Link href="/library" className="text-sm text-primary">
            Full library →
          </Link>
        </div>
        {domains.length ? (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {domains.map((d) => (
              <li key={d.id}>
                <Link href={`/topics/${d.id}`} className="flex h-full items-center gap-2.5 rounded-xl border border-border bg-surface p-3 text-sm hover:border-primary/40">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <DomainIcon name={d.icon} className="size-4" />
                  </span>
                  <span className="line-clamp-2 font-medium">{d.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Card className="text-sm text-muted">The knowledge catalog hasn&apos;t been set up yet. Apply the catalog migrations (see README).</Card>
        )}
        <p className="mt-3 text-xs text-muted">These domains are starting points, not limits. Anything you search for can become part of the catalog.</p>
      </section>
    </div>
  );
}
