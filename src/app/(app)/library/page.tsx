import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { DomainIcon } from "@/components/catalog/badges";
import { Button, Card, Input, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listDomains } from "@/lib/catalog/repository";

export const metadata: Metadata = { title: "Knowledge library" };

/** Browses the catalog straight from the database: new domains and disciplines appear without a deploy. */
export default async function LibraryPage() {
  const { db } = await requireUser("/library");
  const domains = await listDomains(db);
  const disciplines = domains.length
    ? await db.query<{ id: string; name: string; parent_id: string; status: string }>(
        "select id, name, parent_id, status from public.knowledge_nodes where parent_id = any($1::uuid[]) and status <> 'rejected' order by name limit 1000",
        [domains.map((d) => d.id)],
      )
    : [];
  const byDomain = new Map<string, Array<{ id: string; name: string; status: string }>>();
  for (const d of disciplines) byDomain.set(d.parent_id, [...(byDomain.get(d.parent_id) ?? []), d]);

  return (
    <div>
      <PageHeader title="Knowledge library" description="A growing map of human knowledge. Can't find something? Search for it and LearnFlow will map it out." />
      <Card className="mb-6">
        <form action="/explore" className="flex flex-col gap-2 sm:flex-row" role="search">
          <label htmlFor="lib-q" className="sr-only">
            Search the library
          </label>
          <div className="relative flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input id="lib-q" name="q" placeholder="Search any subject, e.g. glassblowing, game theory, Swahili…" className="pl-9" maxLength={200} required minLength={2} />
          </div>
          <Button type="submit">Search</Button>
        </form>
      </Card>

      {domains.length === 0 ? (
        <Card className="text-sm text-muted">The knowledge catalog hasn&apos;t been set up yet. Apply the catalog migrations in db/migrations.</Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {domains.map((d) => {
            const children = byDomain.get(d.id) ?? [];
            return (
              <Card key={d.id} className="flex flex-col">
                <Link href={`/topics/${d.id}`} className="flex items-center gap-2 hover:text-primary">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <DomainIcon name={d.icon} className="size-4" />
                  </span>
                  <h2 className="font-semibold">{d.name}</h2>
                </Link>
                {d.description && <p className="mt-2 text-xs text-muted">{d.description}</p>}
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {children.slice(0, 10).map((c) => (
                    <li key={c.id}>
                      <Link href={`/topics/${c.id}`} className="inline-flex min-h-8 items-center rounded-full border border-border px-2.5 text-xs hover:border-primary">
                        {c.name}
                      </Link>
                    </li>
                  ))}
                </ul>
                {children.length > 10 && (
                  <Link href={`/topics/${d.id}`} className="mt-2 text-xs text-primary">
                    +{children.length - 10} more →
                  </Link>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
