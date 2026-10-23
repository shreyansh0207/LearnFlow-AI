import { z } from "zod";
import { LEARNING_PATTERNS } from "@/lib/catalog/patterns";

export const LEARNING_STYLES = ["examples", "reading", "exercises", "visual"] as const;
export const CURRENT_LEVELS = ["none", "beginner", "intermediate", "advanced"] as const;
export const TARGET_LEVELS = ["beginner", "intermediate", "advanced", "expert"] as const;

export const CURRENT_LEVEL_LABEL: Record<(typeof CURRENT_LEVELS)[number], string> = {
  none: "Complete beginner — starting from zero",
  beginner: "Beginner — I know a few basics",
  intermediate: "Intermediate — comfortable with the fundamentals",
  advanced: "Advanced — looking to deepen expertise",
};

export const TARGET_LEVEL_LABEL: Record<(typeof TARGET_LEVELS)[number], string> = {
  beginner: "Solid beginner",
  intermediate: "Confident intermediate",
  advanced: "Advanced practitioner",
  expert: "Expert",
};

export const STYLE_LABEL: Record<(typeof LEARNING_STYLES)[number], string> = {
  examples: "Examples",
  reading: "Reading",
  exercises: "Exercises",
  visual: "Visual explanations",
};

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

export const JourneyInputSchema = z.object({
  subject: z.string().trim().min(2, { message: "Tell us what you want to learn" }).max(160),
  goal: optionalText(1000),
  motivation: optionalText(1000),
  currentLevel: z.enum(CURRENT_LEVELS).default("none"),
  targetLevel: z.enum(TARGET_LEVELS).default("intermediate"),
  minutesPerDay: z.coerce.number().int().min(5).max(240).default(20),
  daysPerWeek: z.coerce.number().int().min(1).max(7).default(5),
  learningStyles: z.array(z.enum(LEARNING_STYLES)).max(4).default([]),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  timezone: z.string().max(64).optional(),
  onboarding: z.boolean().optional(),
  knowledgeNodeId: z.uuid().optional().nullable(),
  /** Client-generated id that makes retried submissions idempotent. */
  requestId: z.uuid().optional(),
  learningPattern: z.enum(LEARNING_PATTERNS).optional().nullable(),
  scopeNotes: optionalText(1000),
});
export type JourneyInput = z.input<typeof JourneyInputSchema>;

export const uuidSchema = z.uuid();
