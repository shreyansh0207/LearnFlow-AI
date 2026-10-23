import "server-only";
import { readAIConfig } from "@/lib/env";
import type { Db } from "@/lib/db";
import { AIError, generateStructured, generateText, type ChatTurn } from "./client";
import { enforceAIRateLimit } from "./rate-limit";
import {
  BRANCHES_SYSTEM,
  CURRICULUM_SYSTEM,
  EVALUATE_SYSTEM,
  REVISION_SYSTEM,
  SELF_TEST_PROMPT,
  SELF_TEST_SYSTEM,
  evaluatePrompt,
  revisionPrompt,
  EXPANSION_SYSTEM,
  INTERPRET_SYSTEM,
  LESSON_ACTIONS,
  LESSON_SYSTEM,
  PROPOSE_SYSTEM,
  QUIZ_SYSTEM,
  REVIEW_SYSTEM,
  actionSystem,
  branchesPrompt,
  curriculumPrompt,
  diagnosticPrompt,
  expansionPrompt,
  interpretPrompt,
  lessonPrompt,
  proposePrompt,
  quizPrompt,
  reviewPrompt,
  tutorSystem,
  type JourneyBrief,
  type LessonAction,
  type LessonVariant,
} from "./prompts";
import {
  CurriculumReviewSchema,
  CurriculumSchema,
  ExerciseFeedbackSchema,
  RevisionPlanSchema,
  sanitizeFeedback,
  sanitizeRevisionPlan,
  type ExerciseFeedback,
  type RevisionPlan,
  ExpansionSchema,
  LessonSchema,
  QuizSchema,
  sanitizeCurriculum,
  sanitizeExpansion,
  sanitizeLesson,
  sanitizeQuiz,
  sanitizeReview,
  type Curriculum,
  type CurriculumReview,
  type Expansion,
  type LessonContent,
  type Quiz,
} from "./schemas";
import { demoCurriculum, demoDiagnostic, demoExpansion, demoLesson, demoProposal, demoQuiz, demoText, heuristicInterpretation } from "./demo";
import { PATTERN_GUIDANCE, type LearningPattern } from "@/lib/catalog/patterns";
import {
  BranchesSchema,
  InterpretationSchema,
  TopicProposalSchema,
  sanitizeBranches,
  sanitizeInterpretation,
  sanitizeProposal,
  type Branches,
  type Interpretation,
  type TopicProposal,
} from "@/lib/catalog/schemas";
import { extractTopicPhrase } from "@/lib/catalog/text";
import { sourcesForPrompt } from "@/lib/sources/sanitize";
import type { SourceDoc } from "@/lib/sources/types";

export type Generated<T> = { data: T; source: "ai" | "demo"; model: string | null };

type Ctx = { db: Db; userId: string };

/** Resolves the AI mode and applies the per-user rate limit. Throws a readable AIError when unavailable. */
async function prepare(ctx: Ctx, kind: string) {
  const config = readAIConfig();
  if (config.mode === "unconfigured") throw new AIError("not_configured", config.reason);
  await enforceAIRateLimit(ctx.db, ctx.userId, kind, config.rateLimitPerHour);
  return config.mode;
}

export type CurriculumGenerationInput = {
  brief: JourneyBrief;
  pattern: LearningPattern;
  catalogHints: string | null;
  sources: SourceDoc[];
};

export async function generateCurriculum(ctx: Ctx, input: CurriculumGenerationInput): Promise<Generated<Curriculum>> {
  const mode = await prepare(ctx, "curriculum");
  if (mode === "demo") return { data: sanitizeCurriculum(demoCurriculum(input.brief)), source: "demo", model: null };
  const refs = new Set(input.sources.map((s) => s.ref));
  const { data, model } = await generateStructured({
    schema: CurriculumSchema,
    system: CURRICULUM_SYSTEM,
    prompt: curriculumPrompt(input.brief, {
      pattern: input.pattern,
      patternGuidance: PATTERN_GUIDANCE[input.pattern],
      catalogHints: input.catalogHints,
      sourcesBlock: sourcesForPrompt(input.sources),
    }),
  });
  return { data: sanitizeCurriculum(data, refs), source: "ai", model };
}

export async function generateExpansion(
  ctx: Ctx,
  input: Omit<Parameters<typeof expansionPrompt>[0], "patternGuidance" | "sourcesBlock"> & { pattern: LearningPattern; sources: SourceDoc[] },
): Promise<Generated<Expansion>> {
  const mode = await prepare(ctx, "expand_curriculum");
  if (mode === "demo") return { data: sanitizeExpansion(demoExpansion(input.subject, input.focus), new Set()), source: "demo", model: null };
  const { data, model } = await generateStructured({
    schema: ExpansionSchema,
    system: EXPANSION_SYSTEM,
    prompt: expansionPrompt({ ...input, patternGuidance: PATTERN_GUIDANCE[input.pattern], sourcesBlock: sourcesForPrompt(input.sources) }),
    maxTokens: 12000,
  });
  return { data: sanitizeExpansion(data, new Set(input.sources.map((s) => s.ref))), source: "ai", model };
}

/** AI gap review. Not available in demo mode: a template "review" would be meaningless. */
export async function reviewCurriculumWithAI(ctx: Ctx, input: Parameters<typeof reviewPrompt>[0]): Promise<Generated<CurriculumReview>> {
  const mode = await prepare(ctx, "review");
  if (mode === "demo") throw new AIError("not_configured", "AI gap review needs an AI provider. The rule-based checks above still apply.");
  const { data, model } = await generateStructured({ schema: CurriculumReviewSchema, system: REVIEW_SYSTEM, prompt: reviewPrompt(input), maxTokens: 8000 });
  return { data: sanitizeReview(data), source: "ai", model };
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export async function interpretGoal(ctx: Ctx, input: { query: string; clarification: string | null; domains: string[] }): Promise<Generated<Interpretation>> {
  const config = readAIConfig();
  const fallbackTopic = extractTopicPhrase(input.clarification ? `${input.clarification}` : input.query);
  if (config.mode !== "live") return { data: heuristicInterpretation(input.query, fallbackTopic), source: "demo", model: null };
  await enforceAIRateLimit(ctx.db, ctx.userId, "interpret", config.rateLimitPerHour);
  const { data, model } = await generateStructured({
    schema: InterpretationSchema,
    system: INTERPRET_SYSTEM,
    prompt: interpretPrompt(input.query, input.clarification, input.domains),
    maxTokens: 4000,
  });
  return { data: sanitizeInterpretation(data, input.query), source: "ai", model };
}

export async function proposeTopic(ctx: Ctx, input: Omit<Parameters<typeof proposePrompt>[0], "sourcesBlock"> & { sources: SourceDoc[] }): Promise<Generated<TopicProposal>> {
  const mode = await prepare(ctx, "propose");
  if (mode === "demo") return { data: sanitizeProposal(demoProposal(input.topic)), source: "demo", model: null };
  const { data, model } = await generateStructured({
    schema: TopicProposalSchema,
    system: PROPOSE_SYSTEM,
    prompt: proposePrompt({ ...input, sourcesBlock: sourcesForPrompt(input.sources) }),
    maxTokens: 8000,
  });
  return { data: sanitizeProposal(data), source: "ai", model };
}

export async function generateBranches(ctx: Ctx, input: Parameters<typeof branchesPrompt>[0]): Promise<Generated<Branches>> {
  const mode = await prepare(ctx, "expand");
  if (mode === "demo") throw new AIError("not_configured", "Generating new branches needs an AI provider.");
  const { data, model } = await generateStructured({ schema: BranchesSchema, system: BRANCHES_SYSTEM, prompt: branchesPrompt(input), maxTokens: 6000 });
  return { data: sanitizeBranches(data, input.name, input.existing), source: "ai", model };
}

export async function generateLesson(
  ctx: Ctx,
  input: Parameters<typeof lessonPrompt>[0] & { variant: LessonVariant },
): Promise<Generated<LessonContent>> {
  const mode = await prepare(ctx, "lesson");
  if (mode === "demo") return { data: demoLesson(input.topicTitle, input.objectives, input.subject), source: "demo", model: null };
  const { data, model } = await generateStructured({ schema: LessonSchema, system: LESSON_SYSTEM, prompt: lessonPrompt(input) });
  return { data: sanitizeLesson(data), source: "ai", model };
}

export async function generateQuiz(ctx: Ctx, input: Parameters<typeof quizPrompt>[0]): Promise<Generated<Quiz>> {
  const mode = await prepare(ctx, "quiz");
  if (mode === "demo") return { data: sanitizeQuiz(demoQuiz(input.topicTitle)), source: "demo", model: null };
  const { data, model } = await generateStructured({ schema: QuizSchema, system: QUIZ_SYSTEM, prompt: quizPrompt(input), maxTokens: 12000 });
  return { data: sanitizeQuiz(data), source: "ai", model };
}

export async function generateDiagnostic(ctx: Ctx, input: Parameters<typeof diagnosticPrompt>[0]): Promise<Generated<Quiz>> {
  const mode = await prepare(ctx, "diagnostic");
  if (mode === "demo") return { data: sanitizeQuiz(demoDiagnostic(input.topics)), source: "demo", model: null };
  const { data, model } = await generateStructured({ schema: QuizSchema, system: QUIZ_SYSTEM, prompt: diagnosticPrompt(input), maxTokens: 12000 });
  return { data: sanitizeQuiz(data), source: "ai", model };
}

export async function runLessonAction(
  ctx: Ctx,
  input: { action: LessonAction; topicTitle: string; subject: string; lessonSummary: string; learnerContext: string },
): Promise<Generated<string>> {
  const mode = await prepare(ctx, `action:${input.action}`);
  if (mode === "demo") return { data: demoText(input.action, input.topicTitle), source: "demo", model: null };
  const { text, model } = await generateText({
    system: actionSystem(input.learnerContext),
    messages: [
      {
        role: "user",
        content: `Subject: ${input.subject}\nTopic: ${input.topicTitle}\nLesson summary: ${input.lessonSummary}\n\nRequest: ${LESSON_ACTIONS[input.action]}`,
      },
    ],
    maxTokens: 4000,
  });
  return { data: text, source: "ai", model };
}

export async function tutorReply(ctx: Ctx, input: { context: string; history: ChatTurn[] }): Promise<Generated<string>> {
  const mode = await prepare(ctx, "tutor");
  const last = input.history[input.history.length - 1]?.content ?? "";
  if (mode === "demo") return { data: demoText(`tutor question: ${last.slice(0, 80)}`, "your question"), source: "demo", model: null };
  const { text, model } = await generateText({ system: tutorSystem(input.context), messages: input.history, maxTokens: 4000 });
  return { data: text, source: "ai", model };
}

// ---------------------------------------------------------------------------
// Assessment feedback, revision coaching, self-test
// ---------------------------------------------------------------------------

export async function evaluateExercise(ctx: Ctx, input: Parameters<typeof evaluatePrompt>[0]): Promise<Generated<ExerciseFeedback>> {
  const mode = await prepare(ctx, "evaluate");
  if (mode === "demo") throw new AIError("not_configured", "Answer evaluation needs Gemini to be configured.");
  const { data, model } = await generateStructured({ schema: ExerciseFeedbackSchema, system: EVALUATE_SYSTEM, prompt: evaluatePrompt(input), maxTokens: 4000 });
  return { data: sanitizeFeedback(data), source: "ai", model };
}

export async function recommendRevision(ctx: Ctx, input: { data: string; topics: string[] }): Promise<Generated<RevisionPlan>> {
  const mode = await prepare(ctx, "revision");
  if (mode === "demo") throw new AIError("not_configured", "AI revision plans need Gemini to be configured.");
  const { data, model } = await generateStructured({ schema: RevisionPlanSchema, system: REVISION_SYSTEM, prompt: revisionPrompt(input.data), maxTokens: 4000 });
  return { data: sanitizeRevisionPlan(data, input.topics), source: "ai", model };
}

/** Runs the fixed compound-interest prompt end to end through the real Gemini service. */
export async function runSelfTest(ctx: Ctx): Promise<{ text: string; model: string; latencyMs: number }> {
  const config = readAIConfig();
  if (config.mode !== "live") throw new AIError("not_configured", config.mode === "unconfigured" ? config.reason : "The self-test needs a real GEMINI_API_KEY (demo mode doesn't call Gemini).");
  await enforceAIRateLimit(ctx.db, ctx.userId, "selftest", config.rateLimitPerHour);
  const started = Date.now();
  const { text, model } = await generateText({ system: SELF_TEST_SYSTEM, messages: [{ role: "user", content: SELF_TEST_PROMPT }], maxTokens: 6000 });
  return { text, model, latencyMs: Date.now() - started };
}
