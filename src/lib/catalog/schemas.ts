import { z } from "zod";
import { InvalidAIOutputError } from "@/lib/ai/schemas";
import { topicKey } from "@/lib/utils";

import { LEARNING_PATTERNS } from "./patterns";

export { LEARNING_PATTERNS, PATTERN_LABEL, type LearningPattern } from "./patterns";

export const NODE_KINDS = ["domain", "discipline", "subject", "subdiscipline", "topic", "subtopic", "concept", "skill", "field"] as const;
export const DIFFICULTIES = ["introductory", "beginner", "intermediate", "advanced", "expert"] as const;

/** Step 1 of discovery: what does the learner actually want? */
export const InterpretationSchema = z.object({
  intent: z.enum(["learn", "explore", "ambiguous", "not_a_learning_goal", "unsafe"]),
  topic: z.string(),
  goalSummary: z.string(),
  scope: z.enum(["broad", "focused", "narrow"]),
  learningPattern: z.enum(LEARNING_PATTERNS),
  domain: z.string(),
  relatedDomains: z.array(z.string()),
  alternativeNames: z.array(z.string()),
  clarifyingQuestion: z.string().nullable(),
  clarifyingOptions: z.array(z.string()),
});
export type Interpretation = z.infer<typeof InterpretationSchema>;

/** Step 2 (topic missing from the catalog): a proposed knowledge structure. */
export const TopicProposalSchema = z.object({
  name: z.string(),
  description: z.string(),
  aliases: z.array(z.string()),
  kind: z.enum(["subject", "subdiscipline", "topic", "subtopic", "concept", "skill", "field"]),
  difficulty: z.enum(DIFFICULTIES),
  learningPattern: z.enum(LEARNING_PATTERNS),
  parentName: z.string().nullable(),
  objectives: z.array(z.string()),
  prerequisites: z.array(z.object({ name: z.string(), reason: z.string() })),
  subtopics: z.array(z.object({ name: z.string(), description: z.string() })),
  related: z.array(z.string()),
  uncertainty: z.string().nullable(),
});
export type TopicProposal = z.infer<typeof TopicProposalSchema>;

/** Expanding a broad node into its main branches. */
export const BranchesSchema = z.object({
  branches: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      kind: z.enum(["subject", "subdiscipline", "topic", "subtopic", "concept", "skill", "field"]),
      difficulty: z.enum(DIFFICULTIES),
    }),
  ),
});
export type Branches = z.infer<typeof BranchesSchema>;

const clip = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);
const uniqueBy = <T,>(items: T[], key: (t: T) => string) => {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = key(i);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

export function sanitizeInterpretation(i: Interpretation, originalQuery: string): Interpretation {
  const topic = clip(i.topic, 160) || clip(originalQuery, 160);
  return {
    ...i,
    topic,
    goalSummary: clip(i.goalSummary, 400),
    domain: clip(i.domain, 120),
    relatedDomains: uniqueBy(i.relatedDomains.map((d) => clip(d, 120)), topicKey).slice(0, 4),
    alternativeNames: uniqueBy(i.alternativeNames.map((d) => clip(d, 120)), topicKey)
      .filter((n) => topicKey(n) !== topicKey(topic))
      .slice(0, 6),
    clarifyingQuestion: i.clarifyingQuestion ? clip(i.clarifyingQuestion, 300) : null,
    clarifyingOptions: uniqueBy(i.clarifyingOptions.map((o) => clip(o, 120)), topicKey).slice(0, 5),
  };
}

/**
 * Repairs and validates a proposed topic structure before anything is saved:
 * trims sizes, removes duplicates, self-references and circular prerequisites.
 */
export function sanitizeProposal(p: TopicProposal): TopicProposal {
  const name = clip(p.name, 200);
  if (name.length < 2) throw new InvalidAIOutputError("Proposal has no usable topic name");
  const nameKey = topicKey(name);
  const description = clip(p.description, 2000);
  if (description.length < 20) throw new InvalidAIOutputError("Proposal description is too short");

  const subtopics = uniqueBy(
    p.subtopics.map((s) => ({ name: clip(s.name, 200), description: clip(s.description, 1000) })).filter((s) => s.name.length >= 2 && topicKey(s.name) !== nameKey),
    (s) => topicKey(s.name),
  ).slice(0, 12);
  const subKeys = new Set(subtopics.map((s) => topicKey(s.name)));

  const prerequisites = uniqueBy(
    p.prerequisites
      .map((r) => ({ name: clip(r.name, 200), reason: clip(r.reason, 400) }))
      // A topic cannot require itself, and a subtopic of X cannot be a prerequisite of X.
      .filter((r) => r.name.length >= 2 && topicKey(r.name) !== nameKey && !subKeys.has(topicKey(r.name))),
    (r) => topicKey(r.name),
  ).slice(0, 8);

  return {
    ...p,
    name,
    description,
    aliases: uniqueBy(p.aliases.map((a) => clip(a, 120)), topicKey).filter((a) => topicKey(a) !== nameKey).slice(0, 8),
    parentName: p.parentName ? clip(p.parentName, 200) : null,
    objectives: uniqueBy(p.objectives.map((o) => clip(o, 300)), topicKey).slice(0, 8),
    prerequisites,
    subtopics,
    related: uniqueBy(p.related.map((r) => clip(r, 200)), topicKey)
      .filter((r) => topicKey(r) !== nameKey)
      .slice(0, 8),
    uncertainty: p.uncertainty ? clip(p.uncertainty, 600) : null,
  };
}

export function sanitizeBranches(b: Branches, parentName: string, existingChildNames: string[]): Branches {
  const taken = new Set([topicKey(parentName), ...existingChildNames.map(topicKey)]);
  const branches = uniqueBy(
    b.branches.map((x) => ({ ...x, name: clip(x.name, 200), description: clip(x.description, 1000) })).filter((x) => x.name.length >= 2 && !taken.has(topicKey(x.name))),
    (x) => topicKey(x.name),
  ).slice(0, 12);
  if (branches.length === 0) throw new InvalidAIOutputError("No new branches were proposed");
  return { branches };
}
