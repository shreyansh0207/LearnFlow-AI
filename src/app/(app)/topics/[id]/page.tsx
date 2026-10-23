import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, ExternalLink, Info, Library } from "lucide-react";
import { DomainIcon, PROVENANCE_HELP, ProvenanceBadge } from "@/components/catalog/badges";
import { ExpandBranchesButton, SuggestSubtopic } from "@/components/catalog/topic-actions";
import { Alert, Badge, ButtonLink, Card, CardTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { PATTERN_LABEL, type LearningPattern } from "@/lib/catalog/patterns";
import { CHILD_PAGE_SIZE, getNodeDetail } from "@/lib/catalog/repository";
import { formatRelative } from "@/lib/learning/dates";
import { readAIConfig } from "@/lib/env";
import { isUuid } from "@/lib/utils";

export const metadata: Metadata = { title: "Topic" };

export default async function TopicPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string; new?: string; goal?: string; pattern?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const { db } = await requireUser(`/topics/${id}`);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const detail = await getNodeDetail(db, id, page);
  if (!detail) notFound();
  const { node } = detail;
  if (node.status === "merged" && node.merged_into) redirect(`/topics/${node.merged_into}`);

  const myJourneys = await db.query<{ id: string; title: string; status: string }>(
    "select id, title, status from public.learning_journeys where knowledge_node_id = $1 and status <> 'archived' limit 5",
    [id],
  );
  const pattern = (sp.pattern || node.learning_pattern || "") as LearningPattern | "";
  const journeyParams = new URLSearchParams({ subject: node.name, node: node.id, ...(sp.goal ? { goal: sp.goal.slice(0, 1000) } : {}), ...(pattern ? { pattern } : {}) });
  const canExpand = readAIConfig().mode === "live" && true;
  const canSuggest = true;
  const totalPages = Math.max(1, Math.ceil(detail.childCount / CHILD_PAGE_SIZE));

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-muted">
        <Link href="/library" className="inline-flex items-center gap-1 hover:text-ink">
          <Library aria-hidden className="size-3.5" /> Library
        </Link>
        {detail.ancestors.map((a) => (
          <span key={a.id} className="flex items-center gap-1">
            <span aria-hidden>›</span>
            <Link href={`/topics/${a.id}`} className="hover:text-ink">
              {a.name}
            </Link>
          </span>
        ))}
      </nav>

      {sp.new === "1" && (
        <Alert kind="info" title="We mapped this topic for you">
          It wasn&apos;t in the catalog yet, so LearnFlow built a starting structure: description, prerequisites and branches. It&apos;s marked unreviewed until our team checks it. Review it, then start a journey personalised to your goal.
        </Alert>
      )}

      <header className="flex flex-wrap items-start gap-4">
        {node.kind === "domain" && (
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <DomainIcon name={node.icon} className="size-6" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{node.name}</h1>
            <ProvenanceBadge origin={node.origin} status={node.status} />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            <Badge className="capitalize">{node.kind}</Badge>
            {node.difficulty && <Badge className="capitalize">{node.difficulty}</Badge>}
            {pattern && <Badge tone="accent">{PATTERN_LABEL[pattern as LearningPattern] ?? pattern}</Badge>}
          </div>
          {node.aliases.length > 0 && <p className="mt-2 text-xs text-muted">Also known as: {node.aliases.join(", ")}</p>}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-4">
          <Card>
            {node.description ? <p className="leading-relaxed">{node.description}</p> : <p className="text-sm text-muted">No description yet.</p>}
            {node.status !== "verified" && (
              <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
                <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" /> {PROVENANCE_HELP[node.status] ?? PROVENANCE_HELP.proposed}
              </p>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              <ButtonLink href={`/journeys/new?${journeyParams.toString()}`}>
                Start a learning journey <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
              <ButtonLink href={`/tutor`} variant="secondary">
                Ask the tutor about it
              </ButtonLink>
            </div>
            {myJourneys.length > 0 && (
              <p className="mt-3 text-sm text-muted">
                Your journeys on this topic:{" "}
                {myJourneys.map((j, i) => (
                  <span key={j.id}>
                    {i > 0 && ", "}
                    <Link href={`/journeys/${j.id}`} className="font-medium text-primary">
                      {j.title}
                    </Link>
                  </span>
                ))}
              </p>
            )}
          </Card>

          {node.learning_objectives.length > 0 && (
            <Card>
              <CardTitle>What you&apos;ll be able to do</CardTitle>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {node.learning_objectives.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>{node.kind === "domain" ? "Disciplines" : "Branches & subtopics"}</CardTitle>
              <span className="text-xs text-muted">{detail.childCount} in the catalog</span>
            </div>
            {detail.children.length ? (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {detail.children.map((c) => (
                  <li key={c.id}>
                    <Link href={`/topics/${c.id}`} className="block h-full rounded-xl border border-border p-3 hover:border-primary/40">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium">{c.name}</span>
                        {c.status !== "verified" && <ProvenanceBadge origin={c.origin} status={c.status} />}
                      </div>
                      {c.description && <p className="mt-1 line-clamp-2 text-xs text-muted">{c.description}</p>}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">No branches mapped yet.</p>
            )}
            {totalPages > 1 && (
              <nav aria-label="Branches pagination" className="mt-3 flex gap-4 text-sm">
                {page > 1 && <Link className="text-primary" href={`/topics/${id}?page=${page - 1}`}>← Previous</Link>}
                <span className="text-muted">Page {page} of {totalPages}</span>
                {page < totalPages && <Link className="text-primary" href={`/topics/${id}?page=${page + 1}`}>Next →</Link>}
              </nav>
            )}
            <div className="mt-4 flex flex-wrap items-start gap-2 border-t border-border pt-3">
              {canExpand && detail.childCount < 40 && <ExpandBranchesButton nodeId={id} />}
              {canSuggest && <SuggestSubtopic parentId={id} />}
            </div>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardTitle className="text-sm">Learn these first</CardTitle>
            {detail.prerequisites.length ? (
              <ul className="mt-2 space-y-2 text-sm">
                {detail.prerequisites.map((p) => (
                  <li key={p.id}>
                    <Link href={`/topics/${p.id}`} className="font-medium text-primary">
                      {p.name}
                    </Link>
                    {p.note && <p className="text-xs text-muted">{p.note}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted">No prerequisites recorded. Your curriculum will still check what you need.</p>
            )}
          </Card>
          {detail.unlocks.length > 0 && (
            <Card>
              <CardTitle className="text-sm">Builds toward</CardTitle>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {detail.unlocks.map((u) => (
                  <li key={u.id}>
                    <Link href={`/topics/${u.id}`} className="inline-flex rounded-full border border-border px-2.5 py-1 text-xs hover:border-primary">
                      {u.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {detail.related.length > 0 && (
            <Card>
              <CardTitle className="text-sm">Related</CardTitle>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {detail.related.map((r) => (
                  <li key={r.id}>
                    <Link href={`/topics/${r.id}`} className="inline-flex rounded-full border border-border px-2.5 py-1 text-xs hover:border-primary">
                      {r.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card>
            <CardTitle className="text-sm">Sources</CardTitle>
            {detail.sources.length ? (
              <ul className="mt-2 space-y-3">
                {detail.sources.map((s) => (
                  <li key={s.id} className="text-sm">
                    <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-start gap-1 font-medium text-primary hover:underline">
                      {s.title} <ExternalLink aria-hidden className="mt-0.5 size-3 shrink-0" />
                    </a>
                    <p className="text-xs text-muted">
                      {s.provider}
                      {s.authors && ` · ${s.authors}`}
                      {s.published && ` · ${s.published}`} · retrieved {formatRelative(s.retrieved_at)}
                      {s.license && ` · ${s.license}`}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted">No external sources are attached to this topic yet.</p>
            )}
            <p className="mt-3 text-[11px] text-muted">Sources are retrieved automatically from public references and listed for verification. Descriptions are written by LearnFlow, not quoted from them.</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
