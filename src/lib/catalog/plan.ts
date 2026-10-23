import type { Interpretation } from "./schemas";
import { canonicalKey, nameSimilarity } from "./text";

export type CatalogHit = {
  id: string;
  parent_id: string | null;
  domain_id: string | null;
  path: string;
  name: string;
  aliases: string[];
  description: string | null;
  kind: string;
  difficulty: string | null;
  origin: string;
  status: string;
  request_count: number;
  rank: number;
};

/** search_knowledge adds +2.0 when the name or an alias matches the normalised key exactly. */
export const EXACT_RANK = 2;
export const STRONG_SIMILARITY = 0.8;

export type DiscoveryPlan =
  | { action: "clarify"; question: string; options: string[] }
  | { action: "reject"; reason: "unsafe" | "not_a_learning_goal" }
  | { action: "explore"; node: CatalogHit }
  | { action: "use_existing"; node: CatalogHit }
  | { action: "propose"; candidates: CatalogHit[] };

const BROAD_KINDS = new Set(["domain", "discipline", "subject", "field"]);

/**
 * Decides what discovery should do next, from the interpretation and catalog
 * matches. Pure so the routing rules are explicit and testable.
 */
export function planDiscovery(i: Interpretation, hits: CatalogHit[], opts: { clarified: boolean }): DiscoveryPlan {
  if (i.intent === "unsafe") return { action: "reject", reason: "unsafe" };
  if (i.intent === "not_a_learning_goal") return { action: "reject", reason: "not_a_learning_goal" };
  if (i.intent === "ambiguous" && !opts.clarified && i.clarifyingQuestion) {
    return { action: "clarify", question: i.clarifyingQuestion, options: i.clarifyingOptions };
  }

  // A "strong" match must be the same topic by name — not merely a related broader
  // topic ("Photography" is not a match for "underwater photography").
  const names = [i.topic, ...i.alternativeNames];
  const best = hits.find((h) => h.rank >= EXACT_RANK || names.some((n) => [h.name, ...h.aliases].some((hn) => canonicalKey(n) === canonicalKey(hn) || nameSimilarity(n, hn) >= STRONG_SIMILARITY)));
  if (best) {
    const wantsBranches = i.scope === "broad" || i.intent === "explore";
    if (wantsBranches && BROAD_KINDS.has(best.kind)) return { action: "explore", node: best };
    return { action: "use_existing", node: best };
  }
  return { action: "propose", candidates: hits.slice(0, 8) };
}
