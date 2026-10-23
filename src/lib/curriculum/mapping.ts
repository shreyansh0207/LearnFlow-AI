import { nameSimilarity } from "@/lib/catalog/text";

export const MAPPING_THRESHOLD = 0.75;

export type MappableTopic = { id: string; title: string; key: string };

/**
 * Maps topics in a regenerated curriculum to topics in the previous version so a
 * learner's progress carries over. Exact normalised titles map first; then
 * clearly similar titles map one-to-one, best match first. Unclear relationships
 * are left unmapped rather than guessed.
 */
export function mapTopics(previous: MappableTopic[], next: MappableTopic[], threshold = MAPPING_THRESHOLD): Map<string, string> {
  const result = new Map<string, string>(); // next.id → previous.id
  const usedPrev = new Set<string>();

  const prevByKey = new Map<string, MappableTopic>();
  for (const p of previous) if (!prevByKey.has(p.key)) prevByKey.set(p.key, p);
  for (const n of next) {
    const p = prevByKey.get(n.key);
    if (p && !usedPrev.has(p.id)) {
      result.set(n.id, p.id);
      usedPrev.add(p.id);
    }
  }

  const pairs: Array<{ n: string; p: string; score: number }> = [];
  for (const n of next) {
    if (result.has(n.id)) continue;
    for (const p of previous) {
      if (usedPrev.has(p.id)) continue;
      const score = nameSimilarity(n.title, p.title);
      if (score >= threshold) pairs.push({ n: n.id, p: p.id, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  for (const pair of pairs) {
    if (result.has(pair.n) || usedPrev.has(pair.p)) continue;
    result.set(pair.n, pair.p);
    usedPrev.add(pair.p);
  }
  return result;
}
