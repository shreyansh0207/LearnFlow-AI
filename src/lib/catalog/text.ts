import { topicKey } from "@/lib/utils";

/** Character trigrams of a normalised string (same idea as Postgres pg_trgm). */
function trigrams(s: string): Set<string> {
  const padded = `  ${topicKey(s).replace(/-/g, " ")} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  return out;
}

/** 0..1 similarity between two names (Jaccard over trigrams). */
export function nameSimilarity(a: string, b: string): number {
  if (topicKey(a) === topicKey(b)) return 1;
  const A = trigrams(a);
  const B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

// British → American spelling variants, applied per word.
const SPELLING_VARIANTS: Array<[RegExp, string]> = [
  // colour, behaviour, behavioural, favourite (short words like "four"/"tour" are skipped by the length guard)
  [/our(al|ed|ing|able|ful|less|ism|ist|ite|s)?$/, "or$1"],
  [/isation$/, "ization"],
  [/ise$/, "ize"],
  [/ising$/, "izing"],
  [/yse$/, "yze"],
  [/ysing$/, "yzing"],
  [/tre$/, "ter"], // centre, theatre
  [/ogue$/, "og"], // catalogue
  [/ae/, "e"], // anaesthesia, palaeontology
  [/oe/, "e"], // oesophagus
];

/**
 * Canonical form used for CERTAIN equivalence: ignores spacing/hyphens
 * ("Cyber security" = "Cybersecurity") and British/American spelling
 * ("Behavioural" = "Behavioral").
 */
export function canonicalKey(name: string): string {
  return topicKey(name)
    .split("-")
    .map((w) => (w.length > 5 ? SPELLING_VARIANTS.reduce((acc, [re, to]) => acc.replace(re, to), w) : w))
    .join("");
}

/**
 * Near-identical names (likely typos) are NOT merged automatically: trigram
 * similarity can't tell "Microeconomics" from "Macroeconomics" or "Organic" from
 * "Inorganic chemistry". Matches above this threshold are surfaced to admins as
 * possible duplicates instead.
 */
export const POSSIBLE_DUPLICATE_THRESHOLD = 0.6;

export type NamedCandidate = { id: string; name: string; aliases?: string[] };
export type DuplicateReason = "exact" | "alias" | "variant";

/** Finds an existing entry that is certainly the same topic (exact name, alias, or spelling/spacing variant). */
export function findDuplicate<T extends NamedCandidate>(name: string, aliases: string[], candidates: T[]): { match: T; reason: DuplicateReason } | null {
  const key = topicKey(name);
  const keys = new Set([key, ...aliases.map(topicKey)].filter(Boolean));
  const canon = new Set([name, ...aliases].map(canonicalKey).filter(Boolean));
  let best: { match: T; reason: DuplicateReason } | null = null;
  for (const c of candidates) {
    if (topicKey(c.name) === key) return { match: c, reason: "exact" };
    const names = [c.name, ...(c.aliases ?? [])];
    if (names.map(topicKey).some((k) => keys.has(k))) best = { match: c, reason: "alias" };
    else if (!best && names.map(canonicalKey).some((k) => canon.has(k))) best = { match: c, reason: "variant" };
  }
  return best;
}

/** Candidates that look similar enough to deserve a human check. */
export function possibleDuplicates<T extends NamedCandidate>(name: string, candidates: T[]): Array<{ match: T; score: number }> {
  return candidates
    .map((c) => ({ match: c, score: Math.max(...[c.name, ...(c.aliases ?? [])].map((n) => nameSimilarity(name, n))) }))
    .filter((x) => x.score >= POSSIBLE_DUPLICATE_THRESHOLD && x.score < 1)
    .sort((a, b) => b.score - a.score);
}

const FILLER = [
  /\b(i\s+(really\s+)?(want|would\s+like|wish|need|hope|plan)\s+to)\b/gi,
  /\b(i'?m\s+(interested\s+in|curious\s+about|trying\s+to))\b/gi,
  /\b(please|can\s+you|could\s+you|help\s+me|teach\s+me|show\s+me|explain|tell\s+me\s+about)\b/gi,
  /\b(learn(ing)?|study(ing)?|understand(ing)?|master(ing)?|get\s+(good|better)\s+at|know\s+more\s+about)\b/gi,
  /\b(from\s+(beginner|scratch|zero)(\s+to\s+(expert|advanced))?|for\s+beginners|the\s+basics\s+of|basics\s+of|how\s+to|about)\b/gi,
];

/**
 * Best-effort topic extraction when no AI is available, e.g.
 * "Teach me traditional Japanese woodworking" → "traditional Japanese woodworking".
 */
export function extractTopicPhrase(query: string): string {
  let s = query.replace(/[?!.]+$/g, " ");
  for (const re of FILLER) s = s.replace(re, " ");
  s = s.replace(/^\s*(the|a|an|how|what|why)\s+/i, " ").replace(/\s+/g, " ").trim();
  return s.length >= 2 ? s : query.trim();
}

/** A URL-safe path segment for a catalog node. */
export function pathSegment(name: string): string {
  return topicKey(name) || "topic";
}

/** Normalised key for aggregating anonymous topic requests. */
export function requestKey(topic: string): string {
  return topicKey(extractTopicPhrase(topic)).slice(0, 200);
}
