/**
 * Transparent mastery model.
 *
 * Lesson completion and mastery are tracked separately: finishing a lesson moves a
 * topic to "in_progress", but only demonstrated performance (quiz accuracy, review
 * recall) can raise mastery. Self-reported confidence is a small, optional signal.
 *
 * mastery = weighted average of the components that exist, where
 *   quiz       = exponential moving average of quiz scores (recent attempts count more)
 *   recall     = exponential moving average of spaced-repetition ratings
 *   confidence = self-reported 1–5, mapped to 0–1
 * Missing components are left out and the remaining weights are renormalised.
 */
export const MASTERY_CONFIG = {
  weights: { quiz: 0.6, recall: 0.25, confidence: 0.15 },
  /** Weight of the newest observation in each moving average. */
  emaAlpha: 0.5,
  needsPracticeBelow: 0.6,
  proficientAt: 0.8,
  masteredAt: 0.9,
  /** A topic cannot be "mastered" from a single lucky quiz. */
  minQuizAttemptsForMastered: 2,
  recallValue: { again: 0, hard: 0.5, good: 0.85, easy: 1 },
} as const;

export type MasteryStatus = "not_started" | "in_progress" | "needs_practice" | "developing" | "proficient" | "mastered";

export type MasteryState = {
  quizEma: number | null;
  recallEma: number | null;
  confidence: number | null; // 1..5
  quizAttempts: number;
  lessonCompleted: boolean;
};

export type ReviewRating = keyof typeof MASTERY_CONFIG.recallValue;

export function ema(previous: number | null, observation: number, alpha: number = MASTERY_CONFIG.emaAlpha): number {
  const clamped = Math.min(1, Math.max(0, observation));
  return previous === null ? clamped : alpha * clamped + (1 - alpha) * previous;
}

export function computeMastery(state: MasteryState): number {
  const { weights } = MASTERY_CONFIG;
  const parts: Array<[number, number]> = [];
  if (state.quizEma !== null) parts.push([state.quizEma, weights.quiz]);
  if (state.recallEma !== null) parts.push([state.recallEma, weights.recall]);
  // Confidence alone never produces mastery; it only adjusts demonstrated evidence.
  if (state.confidence !== null && parts.length > 0) parts.push([(state.confidence - 1) / 4, weights.confidence]);
  if (parts.length === 0) return 0;
  const totalWeight = parts.reduce((s, [, w]) => s + w, 0);
  const value = parts.reduce((s, [v, w]) => s + v * w, 0) / totalWeight;
  return Math.round(value * 1000) / 1000;
}

export function masteryStatus(state: MasteryState, mastery = computeMastery(state)): MasteryStatus {
  const hasEvidence = state.quizEma !== null || state.recallEma !== null;
  if (!hasEvidence) return state.lessonCompleted ? "in_progress" : "not_started";
  if (mastery < MASTERY_CONFIG.needsPracticeBelow) return "needs_practice";
  if (mastery >= MASTERY_CONFIG.masteredAt && state.quizAttempts >= MASTERY_CONFIG.minQuizAttemptsForMastered) {
    return "mastered";
  }
  if (mastery >= MASTERY_CONFIG.proficientAt) return "proficient";
  return "developing";
}

export function applyQuizResult(state: MasteryState, score: number): MasteryState {
  return { ...state, quizEma: ema(state.quizEma, score), quizAttempts: state.quizAttempts + 1 };
}

export function applyReviewResult(state: MasteryState, rating: ReviewRating): MasteryState {
  return { ...state, recallEma: ema(state.recallEma, MASTERY_CONFIG.recallValue[rating]) };
}

export const STATUS_LABEL: Record<MasteryStatus, string> = {
  not_started: "Not started",
  in_progress: "Studied — not yet assessed",
  needs_practice: "Needs practice",
  developing: "Developing",
  proficient: "Proficient",
  mastered: "Mastered",
};

/** What the learner should do next for a topic, based only on evidence. */
export function adaptiveAdvice(status: MasteryStatus): { headline: string; actions: string[] } {
  switch (status) {
    case "needs_practice":
      return {
        headline: "Your last result shows this topic needs another pass.",
        actions: ["Re-read with a simpler explanation", "Try an easier practice quiz", "Revisit the prerequisites"],
      };
    case "developing":
      return { headline: "You are close. A little targeted practice will lock this in.", actions: ["Take a practice quiz", "Review your flashcards"] };
    case "proficient":
    case "mastered":
      return { headline: "Strong understanding demonstrated.", actions: ["Try a harder challenge", "Move on to the next topic"] };
    case "in_progress":
      return { headline: "You studied this topic. Test yourself to measure understanding.", actions: ["Take the quiz"] };
    default:
      return { headline: "Start the lesson when you are ready.", actions: ["Begin lesson"] };
  }
}
