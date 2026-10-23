import type { RawSource, SourceProvider } from "./types";

function userAgent() {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://github.com/";
  return `LearnFlowAI/0.1 (${site}; educational curriculum source lookup)`;
}

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal, headers: { "User-Agent": userAgent(), Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
  return res.json();
}

/** Wikipedia (Wikimedia Action API): reputable general reference; text is CC BY-SA. */
export const wikipedia: SourceProvider = {
  name: "Wikipedia",
  async search(query, { limit, signal }) {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      generator: "search",
      gsrsearch: query,
      gsrlimit: String(limit),
      prop: "extracts|info",
      exintro: "1",
      explaintext: "1",
      exsentences: "2",
      inprop: "url",
      origin: "*",
    });
    const data = (await getJson(`https://en.wikipedia.org/w/api.php?${params}`, signal)) as {
      query?: { pages?: Record<string, { title: string; extract?: string; fullurl?: string; index?: number }> };
    };
    return Object.values(data.query?.pages ?? {})
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((p) => ({
        provider: "Wikipedia",
        type: "reference" as const,
        url: p.fullurl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}`,
        title: p.title,
        snippet: p.extract ?? null,
        authors: "Wikipedia contributors",
        published: null,
        license: "CC BY-SA 4.0",
      }));
  },
};

/** OpenAlex: open catalogue of scholarly works (metadata is CC0). */
export const openAlex: SourceProvider = {
  name: "OpenAlex",
  async search(query, { limit, signal }) {
    const params = new URLSearchParams({
      search: query,
      "per-page": String(limit),
      select: "id,display_name,publication_year,doi,primary_location,authorships,type",
      filter: "has_doi:true",
    });
    const mail = process.env.SOURCE_CONTACT_EMAIL;
    if (mail) params.set("mailto", mail);
    const data = (await getJson(`https://api.openalex.org/works?${params}`, signal)) as {
      results?: Array<{
        display_name?: string;
        publication_year?: number;
        doi?: string | null;
        type?: string;
        primary_location?: { landing_page_url?: string | null; source?: { display_name?: string } | null } | null;
        authorships?: Array<{ author?: { display_name?: string } }>;
      }>;
    };
    return (data.results ?? []).map((w): RawSource => {
      const authors = (w.authorships ?? []).map((a) => a.author?.display_name).filter(Boolean) as string[];
      const venue = w.primary_location?.source?.display_name;
      return {
        provider: "OpenAlex",
        type: "academic",
        url: w.doi ?? w.primary_location?.landing_page_url ?? "",
        title: w.display_name ?? "",
        snippet: [w.type ? w.type.replace(/-/g, " ") : null, venue ? `Published in ${venue}` : null].filter(Boolean).join(" · ") || null,
        authors: authors.length > 3 ? `${authors.slice(0, 3).join(", ")} et al.` : authors.join(", ") || null,
        published: w.publication_year ? String(w.publication_year) : null,
        license: "Metadata: CC0 (OpenAlex)",
      };
    });
  },
};

export const DEFAULT_PROVIDERS: SourceProvider[] = [wikipedia, openAlex];
