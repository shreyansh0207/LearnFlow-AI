/**
 * How a subject is best learned. The curriculum engine shapes courses differently
 * per pattern instead of forcing every subject into one template.
 */
export const LEARNING_PATTERNS = ["conceptual", "problem_solving", "language", "hands_on", "creative", "professional", "physical", "mixed"] as const;
export type LearningPattern = (typeof LEARNING_PATTERNS)[number];

export const PATTERN_LABEL: Record<LearningPattern, string> = {
  conceptual: "Concepts & understanding",
  problem_solving: "Problem solving",
  language: "Language learning",
  hands_on: "Hands-on skill",
  creative: "Creative practice",
  professional: "Professional skill",
  physical: "Physical & sport",
  mixed: "Mixed",
};

/** Course-shape guidance given to the curriculum model for each pattern. */
export const PATTERN_GUIDANCE: Record<LearningPattern, string> = {
  conceptual:
    "Build understanding from first principles: core ideas before details, frequent explain-it-back checks, worked examples, and a capstone that applies the ideas to a real question.",
  problem_solving:
    "Sequence problems from routine to novel. Every topic needs worked examples then graded practice problems; introduce notation explicitly; include mixed-practice and proof/derivation topics where relevant.",
  language:
    "Balance vocabulary, grammar, listening, speaking, reading and writing. Use small spiral units around real situations, daily practice topics (kind 'skill_practice'), pronunciation, and regular speaking/production tasks. Note honestly that speaking fluency needs real conversation practice.",
  hands_on:
    "Lead with safety, tools and materials. Alternate short theory with practical tasks (kind 'skill_practice') and build to small projects (kind 'project'). Give every practical topic a safetyNote when there is any physical risk, and say when in-person instruction or supervision is advisable.",
  creative:
    "Combine technique, studying examples from practitioners, and frequent making. Include exercises that build specific skills, feedback/critique habits, and portfolio projects.",
  professional:
    "Teach frameworks through realistic workplace scenarios and case studies, include practice exercises (role-plays, templates, deliverables), and end with a project that produces something usable at work.",
  physical:
    "Cover rules/technique/strategy and safe progressive training. Mark drills as 'skill_practice', include warm-up and injury-prevention guidance (safetyNote), and be clear that coaching and physical practice are needed beyond reading.",
  mixed: "Blend conceptual understanding with practical application, choosing whatever sequence best serves the learner's goal.",
};
