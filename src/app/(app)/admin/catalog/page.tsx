import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProvenanceBadge } from "@/components/catalog/badges";
import { CreateNodeForm, ImportForm, RequestActions, ReviewActions } from "@/components/catalog/admin-forms";
import { Card, CardTitle, PageHeader, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { searchCatalog } from "@/lib/catalog/repository";
import { possibleDuplicates } from "@/lib/catalog/text";
import { formatRelative } from "@/lib/learning/dates";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Catalog admin" };

const TABS = [
  ["review", "Review queue"],
  ["demand", "Demand"],
  ["jobs", "Generation health"],
  ["add", "Add & import"],
] as const;
const PAGE = 25;

export default async function CatalogAdminPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const sp = await searchParams;
  const { db, user } = await requireUser("/admin/catalog");
  // Authorisation is checked on the server; non-admins get a 404 rather than a hint that the page exists.
  const admin = await db.maybeOne("select user_id from public.app_admins where user_id = $1", [user.id]);
  if (!admin) notFound();

  const tab = TABS.some(([t]) => t === sp.tab) ? sp.tab! : "review";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const [proposedCount, openRequests, failed24, total] = await Promise.all([
    db.count("select count(*)::int as count from public.knowledge_nodes where status = 'proposed'"),
    db.count("select count(*)::int as count from public.topic_requests where status = 'open'"),
    db.count("select count(*)::int as count from public.catalog_jobs where status = 'failed' and created_at > now() - interval '1 day'"),
    db.count("select count(*)::int as count from public.knowledge_nodes where status <> 'merged'"),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Knowledge catalog" description="Review proposals, see what learners ask for, and grow the catalog without redeploying." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Topics in catalog" value={total ?? 0} />
        <Stat label="Awaiting review" value={proposedCount ?? 0} />
        <Stat label="Open topic requests" value={openRequests ?? 0} />
        <Stat label="Failed jobs (24h)" value={failed24 ?? 0} />
      </div>

      <nav aria-label="Admin sections" className="flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1">
        {TABS.map(([t, label]) => (
          <Link key={t} href={`/admin/catalog?tab=${t}`} aria-current={tab === t ? "page" : undefined} className={cn("rounded-lg px-3 py-1.5 text-sm", tab === t ? "bg-surface font-medium shadow-sm" : "text-muted")}>
            {label}
          </Link>
        ))}
      </nav>

      {tab === "review" && <ReviewQueue page={page} />}
      {tab === "demand" && <Demand page={page} />}
      {tab === "jobs" && <Jobs />}
      {tab === "add" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardTitle className="mb-3">Add a curated topic</CardTitle>
            <CreateNodeForm />
          </Card>
          <Card>
            <CardTitle className="mb-3">Import a topic tree</CardTitle>
            <ImportForm />
          </Card>
        </div>
      )}
    </div>
  );

  async function ReviewQueue({ page }: { page: number }) {
    const data = await db.query<{ id: string; name: string; path: string; description: string | null; origin: string; status: string; kind: string; created_at: string; request_count: number }>(
      `select id, name, path, description, origin, status, kind, created_at, request_count from public.knowledge_nodes
        where status = 'proposed' order by request_count desc, created_at asc limit $1 offset $2`,
      [PAGE, (page - 1) * PAGE],
    );
    if (!data.length) return <Card className="text-sm text-muted">Nothing awaiting review.</Card>;
    // Likely duplicates (typos, near-identical names) are shown for a human decision, never auto-merged.
    const dupes = await Promise.all(
      data.map(async (n) => possibleDuplicates(n.name, (await searchCatalog(db, n.name, { limit: 8 })).filter((h) => h.id !== n.id)).slice(0, 3)),
    );
    return (
      <div className="space-y-3">
        {data.map((n, i) => (
          <Card key={n.id} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/topics/${n.id}`} className="font-semibold hover:text-primary">
                {n.name}
              </Link>
              <ProvenanceBadge origin={n.origin} status={n.status} />
              <span className="text-xs capitalize text-muted">
                {n.kind} · {formatRelative(n.created_at)} · requested {n.request_count}×
              </span>
            </div>
            <p className="break-all text-xs text-muted">{n.path}</p>
            {n.description && <p className="text-sm text-muted">{n.description}</p>}
            {dupes[i].length > 0 && (
              <p className="text-xs text-warn">
                Possible duplicate of:{" "}
                {dupes[i].map((d, di) => (
                  <span key={d.match.id}>
                    {di > 0 && ", "}
                    <Link href={`/topics/${d.match.id}`} className="underline">
                      {d.match.name}
                    </Link>{" "}
                    <span className="text-muted">({d.match.id.slice(0, 8)})</span>
                  </span>
                ))}
                . Paste its URL below to merge.
              </p>
            )}
            <ReviewActions id={n.id} />
          </Card>
        ))}
        <Pager page={page} tab="review" hasMore={data.length === PAGE} />
      </div>
    );
  }

  async function Demand({ page }: { page: number }) {
    const data = await db.query<{ id: number; display_query: string; request_count: number; status: string; matched_node_id: string | null; last_seen_at: string }>(
      "select id, display_query, request_count, status, matched_node_id, last_seen_at from public.topic_requests where status = 'open' order by request_count desc limit $1 offset $2",
      [PAGE, (page - 1) * PAGE],
    );
    return (
      <Card>
        <CardTitle>Unresolved topic requests</CardTitle>
        <p className="mt-1 text-xs text-muted">Anonymous and aggregated by normalised topic. No user IDs are stored. Prioritise frequently requested topics.</p>
        {data.length ? (
          <ul className="mt-3 divide-y divide-border">
            {data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <Link href={`/explore?q=${encodeURIComponent(r.display_query)}`} className="font-medium hover:text-primary">
                    {r.display_query}
                  </Link>
                  <p className="text-xs text-muted">
                    {r.request_count} request(s) · last {formatRelative(r.last_seen_at)}
                  </p>
                </div>
                <RequestActions id={r.id} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">No open requests.</p>
        )}
        <Pager page={page} tab="demand" hasMore={(data.length ?? 0) === PAGE} />
      </Card>
    );
  }

  async function Jobs() {
    const [recent, failures] = await Promise.all([
      db.query<{ kind: string; status: string }>("select kind, status from public.catalog_jobs where created_at > now() - interval '7 days' limit 5000"),
      db.query<{ id: number; kind: string; topic: string | null; error_code: string | null; created_at: string; duration_ms: number | null }>(
        "select id, kind, topic, error_code, created_at, duration_ms from public.catalog_jobs where status = 'failed' order by created_at desc limit 50",
      ),
    ]);
    const byKind = new Map<string, { ok: number; failed: number }>();
    for (const j of recent) {
      const e = byKind.get(j.kind) ?? { ok: 0, failed: 0 };
      if (j.status === "failed") e.failed++;
      else e.ok++;
      byKind.set(j.kind, e);
    }
    return (
      <div className="space-y-4">
        <Card>
          <CardTitle>Last 7 days</CardTitle>
          {byKind.size ? (
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1 font-medium">Job</th>
                  <th className="py-1 text-right font-medium">Succeeded</th>
                  <th className="py-1 text-right font-medium">Failed</th>
                </tr>
              </thead>
              <tbody>
                {[...byKind.entries()].map(([k, v]) => (
                  <tr key={k} className="border-t border-border">
                    <td className="py-1.5">{k}</td>
                    <td className="py-1.5 text-right tabular-nums">{v.ok}</td>
                    <td className={cn("py-1.5 text-right tabular-nums", v.failed && "text-danger")}>{v.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-2 text-sm text-muted">No jobs recorded yet.</p>
          )}
        </Card>
        <Card>
          <CardTitle>Recent failures</CardTitle>
          {failures.length ? (
            <ul className="mt-3 divide-y divide-border text-sm">
              {failures.map((f) => (
                <li key={f.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{f.kind}</span> · {f.topic ?? "—"}
                  </span>
                  <span className="text-xs text-muted">
                    {f.error_code ?? "error"} · {formatRelative(f.created_at)}
                    {f.duration_ms ? ` · ${Math.round(f.duration_ms / 1000)}s` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">No failures.</p>
          )}
        </Card>
      </div>
    );
  }
}

function Pager({ page, tab, hasMore }: { page: number; tab: string; hasMore: boolean }) {
  if (page === 1 && !hasMore) return null;
  return (
    <nav aria-label="Pagination" className="flex justify-center gap-4 pt-2 text-sm">
      {page > 1 && <Link className="text-primary" href={`/admin/catalog?tab=${tab}&page=${page - 1}`}>← Previous</Link>}
      {hasMore && <Link className="text-primary" href={`/admin/catalog?tab=${tab}&page=${page + 1}`}>Next →</Link>}
    </nav>
  );
}
