import { z } from "zod";
import { LEARNING_PATTERNS } from "@/lib/catalog/patterns";

/**
 * Wire schemas sent to the model as structured-output formats. They use plain
 * types only; size limits and consistency checks are applied afterwards by the
 * sanitize* functions so a slightly-off response is repaired, not rejected.
 */

export const LEVELS = ["beginner", "intermediate", "advanced", "expert"] as const;
export const MODULE_KINDS = ["prerequisites", "foundations", "core", "advanced", "specialization", "practice", "project"] as const;
export const TOPIC_KINDS = ["concept", "skill_practice", "project", "assessment", "review"] as const;
export const RESOURCE_KINDS = ["reference", "textbook", "course", "practice", "tool", "community", "video"] as const;

const ModuleSchema = z.object({
  title: z.string(),
  kind: z.enum(MODULE_KINDS),
  level: z.enum(LEVELS),
  description: z.string(),
  milestone: z.string(),
  topics: z.array(
    z.object({
      title: z.string(),
      kind: z.enum(TOPIC_KINDS),
      summary: z.string(),
      objectives: z.array(z.string()),
      prerequisites: z.array(z.string()),
      estimatedMinutes: z.number(),
      hasExercise: z.boolean(),
      isCheckpoint: z.boolean(),
      /** Ids of retrieved sources ("S1") that genuinely support this topic. */
      sourceRefs: z.array(z.string()),
      safetyNote: z.string().nullable(),
    }),
  ),
});
export type CurriculumModule = z.infer<typeof ModuleSchema>;

export const CurriculumSchema = z.object({
  title: z.string(),
  summary: z.string(),
  learningPattern: z.enum(LEARNING_PATTERNS),
  outcomes: z.array(z.string()),
  prerequisites: z.array(z.object({ name: z.string(), reason: z.string() })),
  modules: z.array(ModuleSchema),
  /** Suggested resource types; a URL is attached only when sourceRef names a retrieved source. */
  resources: z.array(z.object({ title: z.string(), kind: z.enum(RESOURCE_KINDS), sourceRef: z.string().nullable(), note: z.string() })),
  limitations: z.array(z.string()),
});
export type Curriculum = z.infer<typeof CurriculumSchema>;

/** Adds one or two modules to an existing curriculum without touching what's there. */
export const ExpansionSchema = z.object({
  rationale: z.string(),
  modules: z.array(ModuleSchema),
});
export type Expansion = z.infer<typeof ExpansionSchema>;

/** Qualitative gap analysis of a curriculum against the learner's goal. */
export const CurriculumReviewSchema = z.object({
  summary: z.string(),
  missingPrerequisites: z.array(z.string()),
  missingSubtopics: z.array(z.string()),
  orderingIssues: z.array(z.string()),
  unexplainedTerms: z.array(z.string()),
  practicalGaps: z.array(z.string()),
  assessmentGaps: z.array(z.string()),
  uncertainClaims: z.array(z.string()),
  outOfScope: z.array(z.string()),
});
export type CurriculumReview = z.infer<typeof CurriculumReviewSchema>;

const ChoiceQuestion = z.object({
  question: z.string(),
  options: z.array(z.string()),
  answerIndex: z.number(),
  explanation: z.string(),
});

export const LessonSchema = z.object({
  title: z.string(),
  objectives: z.array(z.string()),
  explanation: z.string(),
  keyTerms: z.array(z.object({ term: z.string(), definition: z.string() })),
  analogies: z.array(z.string()),
  examples: z.array(z.object({ title: z.string(), body: z.string() })),
  steps: z.array(z.object({ title: z.string(), detail: z.string() })),
  checkQuestions: z.array(ChoiceQuestion),
  exercise: z.object({ scenario: z.string(), task: z.string(), modelAnswer: z.string() }),
  recap: z.array(z.string()),
  nextStep: z.string(),
  flashcards: z.array(z.object({ front: z.string(), back: z.string() })),
  disclaimer: z.string().nullable(),
});
export type LessonContent = z.infer<typeof LessonSchema>;

export const QuizSchema = z.object({
  questions: z.array(
    z.object({
      prompt: z.string(),
      options: z.array(z.string()),
      correctIndex: z.number(),
      explanation: z.string(),
      concept: z.string(),
    }),
  ),
});
export type Quiz = z.infer<typeof QuizSchema>;

const clip = (s: string, n: number) => s.trim().slice(0, n);
const nonEmpty = (arr: string[], max: number, len = 400) => arr.map((s) => clip(s, len)).filter(Boolean).slice(0, max);

export class InvalidAIOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAIOutputError";
  }
}

/**
 * Repairs module lists. Citations are kept only if they name a source that was
 * actually retrieved for this request (`validRefs`), so references can't be invented.
 */
export function sanitizeModules(mods: CurriculumModule[], validRefs: Set<string>, maxModules = 12): CurriculumModule[] {
  return mods
    .slice(0, maxModules)
    .map((m) => ({
      title: clip(m.title, 200),
      kind: m.kind,
      level: m.level,
      description: clip(m.description, 1000),
      milestone: clip(m.milestone, 400),
      topics: m.topics
        .slice(0, 12)
        .map((t) => ({
          title: clip(t.title, 200),
          kind: t.kind,
          summary: clip(t.summary, 1000),
          objectives: nonEmpty(t.objectives, 6),
          prerequisites: nonEmpty(t.prerequisites, 6, 200),
          estimatedMinutes: Math.min(240, Math.max(3, Math.round(Number(t.estimatedMinutes) || 15))),
          hasExercise: Boolean(t.hasExercise),
          isCheckpoint: Boolean(t.isCheckpoint),
          sourceRefs: Array.from(new Set(t.sourceRefs.map((r) => r.trim().toUpperCase()))).filter((r) => validRefs.has(r)),
          safetyNote: t.safetyNote ? clip(t.safetyNote, 600) || null : null,
        }))
        .filter((t) => t.title),
    }))
    .filter((m) => m.title && m.topics.length > 0);
}

export function sanitizeCurriculum(c: Curriculum, validRefs: Set<string> = new Set()): Curriculum {
  const modules = sanitizeModules(c.modules, validRefs);
  if (modules.length === 0) throw new InvalidAIOutputError("Curriculum contained no usable modules");
  return {
    title: clip(c.title, 160) || "Learning journey",
    summary: clip(c.summary, 2000),
    learningPattern: c.learningPattern,
    outcomes: nonEmpty(c.outcomes, 8),
    prerequisites: c.prerequisites
      .map((p) => ({ name: clip(p.name, 200), reason: clip(p.reason, 400) }))
      .filter((p) => p.name)
      .slice(0, 8),
    modules,
    resources: c.resources
      .map((r) => {
        const ref = r.sourceRef?.trim().toUpperCase() ?? null;
        return { title: clip(r.title, 200), kind: r.kind, sourceRef: ref && validRefs.has(ref) ? ref : null, note: clip(r.note, 400) };
      })
      .filter((r) => r.title)
      .slice(0, 10),
    limitations: nonEmpty(c.limitations, 6, 400),
  };
}

export function sanitizeExpansion(e: Expansion, validRefs: Set<string>): Expansion {
  const modules = sanitizeModules(e.modules, validRefs, 2);
  if (modules.length === 0) throw new InvalidAIOutputError("Expansion contained no usable modules");
  return { rationale: clip(e.rationale, 800), modules };
}

export function sanitizeReview(r: CurriculumReview): CurriculumReview {
  const list = (xs: string[]) => nonEmpty(xs, 8, 300);
  return {
    summary: clip(r.summary, 1200),
    missingPrerequisites: list(r.missingPrerequisites),
    missingSubtopics: list(r.missingSubtopics),
    orderingIssues: list(r.orderingIssues),
    unexplainedTerms: list(r.unexplainedTerms),
    practicalGaps: list(r.practicalGaps),
    assessmentGaps: list(r.assessmentGaps),
    uncertainClaims: list(r.uncertainClaims),
    outOfScope: list(r.outOfScope),
  };
}

function validChoice(q: { options: string[]; answerIndex: number }) {
  return q.options.length >= 2 && Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex < q.options.length;
}

export function sanitizeLesson(l: LessonContent): LessonContent {
  const explanation = l.explanation.trim();
  if (explanation.length < 40) throw new InvalidAIOutputError("Lesson explanation was empty");
  return {
    title: clip(l.title, 200),
    objectives: nonEmpty(l.objectives, 6),
    explanation: explanation.slice(0, 12000),
    keyTerms: l.keyTerms.filter((t) => t.term.trim() && t.definition.trim()).slice(0, 12),
    analogies: nonEmpty(l.analogies, 4, 1200),
    examples: l.examples.filter((e) => e.body.trim()).slice(0, 5),
    steps: l.steps.filter((s) => s.title.trim()).slice(0, 10),
    checkQuestions: l.checkQuestions
      .map((q) => ({ ...q, options: nonEmpty(q.options, 6, 300) }))
      .filter(validChoice)
      .slice(0, 5),
    exercise: {
      scenario: clip(l.exercise.scenario, 2000),
      task: clip(l.exercise.task, 1000),
      modelAnswer: clip(l.exercise.modelAnswer, 3000),
    },
    recap: nonEmpty(l.recap, 8),
    nextStep: clip(l.nextStep, 600),
    flashcards: l.flashcards
      .map((f) => ({ front: clip(f.front, 500), back: clip(f.back, 1000) }))
      .filter((f) => f.front && f.back)
      .slice(0, 6),
    disclaimer: l.disclaimer ? clip(l.disclaimer, 600) : null,
  };
}

export function sanitizeQuiz(q: Quiz): Quiz {
  const questions = q.questions
    .map((x) => ({
      prompt: clip(x.prompt, 1000),
      options: nonEmpty(x.options, 6, 300),
      correctIndex: x.correctIndex,
      explanation: clip(x.explanation, 1500),
      concept: clip(x.concept, 200),
    }))
    .filter((x) => x.prompt && validChoice({ options: x.options, answerIndex: x.correctIndex }))
    .slice(0, 12);
  if (questions.length < 2) throw new InvalidAIOutputError("Quiz contained fewer than two valid questions");
  return { questions };
}

/** Parses lesson JSON stored in the database, tolerating older shapes. */
export function parseStoredLesson(value: unknown): LessonContent | null {
  const parsed = LessonSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Feedback on a learner's free-text exercise answer. No numeric grade: a verdict plus specifics. */
export const ExerciseFeedbackSchema = z.object({
  verdict: z.enum(["correct", "partially_correct", "incorrect", "unclear"]),
  summary: z.string(),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  correctedApproach: z.string(),
  nextStep: z.string(),
});
export type ExerciseFeedback = z.infer<typeof ExerciseFeedbackSchema>;

export function sanitizeFeedback(f: ExerciseFeedback): ExerciseFeedback {
  if (!f.summary.trim()) throw new InvalidAIOutputError("Feedback was empty");
  return {
    verdict: f.verdict,
    summary: clip(f.summary, 800),
    strengths: nonEmpty(f.strengths, 5, 300),
    gaps: nonEmpty(f.gaps, 5, 300),
    correctedApproach: clip(f.correctedApproach, 2000),
    nextStep: clip(f.nextStep, 400),
  };
}

export const REVISION_ACTIVITIES = ["review_cards", "practice_quiz", "reread_simpler", "explain_aloud", "worked_example"] as const;

/** Prioritised revision recommendations, restricted to the learner's real topics. */
export const RevisionPlanSchema = z.object({
  summary: z.string(),
  items: z.array(z.object({ topic: z.string(), reason: z.string(), activity: z.enum(REVISION_ACTIVITIES), minutes: z.number() })),
});
export type RevisionPlan = z.infer<typeof RevisionPlanSchema>;

/** Drops any recommended topic that isn't one of the learner's actual topics (no invented history). */
export function sanitizeRevisionPlan(p: RevisionPlan, allowedTopics: string[]): RevisionPlan {
  const allowed = new Map(allowedTopics.map((t) => [t.trim().toLowerCase(), t]));
  const items = p.items
    .map((i) => ({ ...i, topic: allowed.get(i.topic.trim().toLowerCase()) ?? "" }))
    .filter((i) => i.topic)
    .map((i) => ({ topic: i.topic, reason: clip(i.reason, 300), activity: i.activity, minutes: Math.min(30, Math.max(3, Math.round(Number(i.minutes) || 10))) }))
    .slice(0, 6);
  if (items.length === 0) throw new InvalidAIOutputError("Revision plan named no known topics");
  return { summary: clip(p.summary, 600), items };
}
