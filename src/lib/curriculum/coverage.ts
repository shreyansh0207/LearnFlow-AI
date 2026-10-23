import type { LearningPattern } from "@/lib/catalog/patterns";
import { nameSimilarity } from "@/lib/catalog/text";

/**
 * Rule-based curriculum gap analysis. Each check has a stated criterion, so the
 * summary is explainable. There is deliberately no "completeness %": no defensible
 * method exists for measuring coverage of an open-ended subject.
 */

export type CoverageTopic = {
  title: string;
  kind: string;
  objectives: string[];
  prerequisites: string[];
  hasExercise: boolean;
  isCheckpoint: boolean;
  safetyNote: string | null;
  sourceRefCount: number;
};

export type CoverageInput = {
  learningPattern: LearningPattern | string | null;
  currentLevel: string;
  targetLevel: string;
  outcomes: string[];
  declaredPrerequisites: string[];
  limitations: string[];
  sourceCount: number;
  modules: Array<{ title: string; level: string; kind: string; topics: CoverageTopic[] }>;
};

export type CoverageStatus = "ok" | "attention" | "info";
export type CoverageCheck = { id: string; label: string; status: CoverageStatus; detail: string; items?: string[] };

export const SCOPE_STATEMENT =
  "This curriculum is designed for the stated goal and target level. It is not a complete record of everything known about the subject.";

const LEVEL_ORDER: Record<string, number> = { introductory: 0, none: 0, beginner: 1, intermediate: 2, advanced: 3, expert: 4 };
const PRACTICE_HEAVY = new Set(["hands_on", "language", "physical", "problem_solving", "creative"]);
const PROJECT_EXPECTED = new Set(["hands_on", "creative", "professional"]);
const SAFETY_EXPECTED = new Set(["hands_on", "physical"]);
const SIMILAR = 0.8;

const matches = (a: string, b: string) => nameSimilarity(a, b) >= SIMILAR;

export function analyzeCoverage(c: CoverageInput): CoverageCheck[] {
  const checks: CoverageCheck[] = [];
  const topics = c.modules.flatMap((m, mi) => m.topics.map((t, ti) => ({ ...t, order: mi * 100 + ti, moduleTitle: m.title })));
  const pattern = c.learningPattern ?? "mixed";

  checks.push(
    c.outcomes.length >= 2
      ? { id: "outcomes", label: "Learning outcomes", status: "ok", detail: `${c.outcomes.length} outcomes are stated.` }
      : { id: "outcomes", label: "Learning outcomes", status: "attention", detail: "Fewer than two concrete outcomes are stated." },
  );

  // Starting point matches the learner.
  const first = c.modules[0];
  const startsLow = !first || (LEVEL_ORDER[first.level] ?? 1) <= Math.max(1, LEVEL_ORDER[c.currentLevel] ?? 1) || ["prerequisites", "foundations"].includes(first.kind);
  checks.push(
    startsLow
      ? { id: "foundations", label: "Starting point", status: "ok", detail: `Starts at a level that suits a ${c.currentLevel === "none" ? "complete beginner" : `${c.currentLevel} learner`}.` }
      : { id: "foundations", label: "Starting point", status: "attention", detail: `The first module is ${first.level}, which may be too steep for a ${c.currentLevel} starting level.` },
  );

  // Difficulty should not drop back down between modules.
  const regressions: string[] = [];
  for (let i = 1; i < c.modules.length; i++) {
    const prev = c.modules[i - 1];
    const cur = c.modules[i];
    if ((LEVEL_ORDER[cur.level] ?? 0) < (LEVEL_ORDER[prev.level] ?? 0) && cur.kind !== "practice" && cur.kind !== "project") {
      regressions.push(`“${cur.title}” (${cur.level}) follows “${prev.title}” (${prev.level})`);
    }
  }
  checks.push(
    regressions.length
      ? { id: "progression", label: "Difficulty progression", status: "attention", detail: "Difficulty drops between some modules.", items: regressions }
      : { id: "progression", label: "Difficulty progression", status: "ok", detail: "Modules progress steadily in difficulty." },
  );

  const top = Math.max(0, ...c.modules.map((m) => LEVEL_ORDER[m.level] ?? 0));
  const target = LEVEL_ORDER[c.targetLevel] ?? 2;
  checks.push(
    top >= target
      ? { id: "target", label: "Reaches the target level", status: "ok", detail: `The curriculum reaches ${c.targetLevel} level material.` }
      : {
          id: "target",
          label: "Reaches the target level",
          status: "attention",
          detail: `The highest module is ${Object.keys(LEVEL_ORDER).find((k) => LEVEL_ORDER[k] === top && k !== "none" && k !== "introductory") ?? "beginner"}, below the ${c.targetLevel} target. Consider expanding the curriculum.`,
        },
  );

  // Prerequisites must be taught earlier, or declared as assumed knowledge.
  const misordered: string[] = [];
  const assumed: string[] = [];
  for (const t of topics) {
    for (const p of t.prerequisites) {
      const taught = topics.find((o) => matches(o.title, p));
      if (taught) {
        if (taught.order >= t.order && taught.title !== t.title) misordered.push(`“${t.title}” needs “${taught.title}”, which comes later`);
      } else if (!c.declaredPrerequisites.some((d) => matches(d, p))) {
        assumed.push(`${p} (for “${t.title}”)`);
      }
    }
  }
  checks.push(
    misordered.length
      ? { id: "order", label: "Prerequisite order", status: "attention", detail: "Some topics come before the topics they depend on.", items: misordered.slice(0, 10) }
      : { id: "order", label: "Prerequisite order", status: "ok", detail: "Every prerequisite taught in this curriculum comes before the topics that need it." },
  );
  checks.push(
    assumed.length
      ? { id: "assumed", label: "Assumed knowledge", status: "info", detail: "These prerequisites are not taught here or declared up front. Review them if they're unfamiliar.", items: Array.from(new Set(assumed)).slice(0, 10) }
      : { id: "assumed", label: "Assumed knowledge", status: "ok", detail: "No undeclared prerequisite knowledge was found." },
  );

  const noObjectives = topics.filter((t) => t.objectives.length === 0).map((t) => t.title);
  checks.push(
    noObjectives.length
      ? { id: "objectives", label: "Topic objectives", status: "attention", detail: `${noObjectives.length} topic(s) have no learning objective.`, items: noObjectives.slice(0, 10) }
      : { id: "objectives", label: "Topic objectives", status: "ok", detail: "Every topic has at least one learning objective." },
  );

  const practiced = topics.filter((t) => t.hasExercise || t.kind === "skill_practice" || t.kind === "project").length;
  const practiceShare = topics.length ? practiced / topics.length : 0;
  const practiceNeeded = PRACTICE_HEAVY.has(pattern) ? 0.6 : 0.5;
  checks.push(
    practiceShare >= practiceNeeded
      ? { id: "practice", label: "Practice & exercises", status: "ok", detail: `${practiced} of ${topics.length} topics include practice.` }
      : { id: "practice", label: "Practice & exercises", status: "attention", detail: `Only ${practiced} of ${topics.length} topics include practice. This subject benefits from at least ${Math.round(practiceNeeded * 100)}%.` },
  );

  const projects = topics.filter((t) => t.kind === "project").length;
  if (PROJECT_EXPECTED.has(pattern) || projects > 0) {
    checks.push(
      projects > 0
        ? { id: "projects", label: "Applied projects", status: "ok", detail: `${projects} project topic(s) apply the skills end to end.` }
        : { id: "projects", label: "Applied projects", status: "attention", detail: "No project topic. Hands-on and creative skills stick best when applied in a real project." },
    );
  }

  const unassessed = c.modules.filter((m) => !m.topics.some((t) => t.isCheckpoint || t.kind === "assessment" || t.kind === "review")).map((m) => m.title);
  checks.push(
    unassessed.length
      ? { id: "assessment", label: "Assessment checkpoints", status: "attention", detail: "Some modules have no checkpoint. Quizzes are still available on every topic.", items: unassessed }
      : { id: "assessment", label: "Assessment checkpoints", status: "ok", detail: "Every module ends with a checkpoint." },
  );

  if (SAFETY_EXPECTED.has(pattern)) {
    const safety = topics.filter((t) => t.safetyNote).length;
    checks.push(
      safety > 0
        ? { id: "safety", label: "Safety guidance", status: "ok", detail: `${safety} topic(s) include safety notes.` }
        : { id: "safety", label: "Safety guidance", status: "attention", detail: "This is a physical or hands-on subject, but no safety notes are included." },
    );
  }

  const cited = topics.filter((t) => t.sourceRefCount > 0).length;
  checks.push(
    c.sourceCount === 0
      ? { id: "sources", label: "External sources", status: "info", detail: "No external sources were retrieved. Topics and explanations are AI-generated and may contain errors." }
      : { id: "sources", label: "External sources", status: "ok", detail: `${c.sourceCount} retrieved source(s); ${cited} of ${topics.length} topics cite at least one.` },
  );

  checks.push(
    c.limitations.length
      ? { id: "limitations", label: "Declared limitations", status: "ok", detail: "The curriculum states what it doesn't cover.", items: c.limitations }
      : { id: "limitations", label: "Declared limitations", status: "info", detail: "No limitations were declared. Treat the scope as the goal you described." },
  );

  return checks;
}

export function summarizeChecks(checks: CoverageCheck[]) {
  return {
    ok: checks.filter((c) => c.status === "ok").length,
    attention: checks.filter((c) => c.status === "attention").length,
    info: checks.filter((c) => c.status === "info").length,
  };
}
