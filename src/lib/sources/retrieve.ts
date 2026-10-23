import { DEFAULT_PROVIDERS } from "./providers";
import { normalizeSources } from "./sanitize";
import type { RawSource, SourceDoc, SourceProvider } from "./types";

export function retrievalEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.SOURCE_RETRIEVAL ?? "on").trim().toLowerCase() !== "off";
}

export type RetrievalResult = { sources: SourceDoc[]; attempted: string[]; failed: string[] };

/**
 * Queries public educational sources in parallel with a hard timeout. Failure is
 * soft: generation continues without sources and the UI says none were used.
 */
export async function retrieveSources(
  query: string,
  opts: { perProvider?: number; limit?: number; timeoutMs?: number; providers?: SourceProvider[] } = {},
): Promise<RetrievalResult> {
  const providers = opts.providers ?? DEFAULT_PROVIDERS;
  if (!retrievalEnabled() && !opts.providers) return { sources: [], attempted: [], failed: [] };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 5000);
  try {
    const settled = await Promise.allSettled(providers.map((p) => p.search(query.slice(0, 200), { limit: opts.perProvider ?? 3, signal: controller.signal })));
    const raw: RawSource[] = [];
    const failed: string[] = [];
    // Interleave providers so one source type doesn't crowd out the other.
    const lists = settled.map((s, i) => {
      if (s.status === "fulfilled") return s.value;
      failed.push(providers[i].name);
      return [];
    });
    for (let i = 0; lists.some((l) => l[i]); i++) for (const l of lists) if (l[i]) raw.push(l[i]);
    return { sources: normalizeSources(raw, new Date(), opts.limit ?? 6), attempted: providers.map((p) => p.name), failed };
  } finally {
    clearTimeout(timer);
  }
}
