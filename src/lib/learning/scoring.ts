export type ScorableQuestion = {
  id: string;
  correct_index: number;
  options: string[];
  concept: string | null;
  prompt: string;
  explanation: string | null;
};

export type AnswerResult = {
  questionId: string;
  selectedIndex: number | null;
  correctIndex: number;
  correct: boolean;
  concept: string | null;
};

export type ScoreResult = {
  correct: number;
  total: number;
  score: number;
  answers: AnswerResult[];
  /** Concepts answered incorrectly, most frequent first. */
  weakConcepts: string[];
};

/**
 * Scores a submission strictly on the server against stored answer keys.
 * Unanswered or out-of-range selections count as incorrect.
 */
export function scoreSubmission(questions: ScorableQuestion[], selections: Record<string, number | null | undefined>): ScoreResult {
  if (questions.length === 0) throw new Error("Cannot score an assessment with no questions");

  const answers: AnswerResult[] = questions.map((q) => {
    const raw = selections[q.id];
    const selectedIndex = typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw < q.options.length ? raw : null;
    return {
      questionId: q.id,
      selectedIndex,
      correctIndex: q.correct_index,
      correct: selectedIndex !== null && selectedIndex === q.correct_index,
      concept: q.concept,
    };
  });

  const correct = answers.filter((a) => a.correct).length;
  const counts = new Map<string, number>();
  for (const a of answers) {
    if (!a.correct && a.concept) counts.set(a.concept, (counts.get(a.concept) ?? 0) + 1);
  }
  const weakConcepts = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);

  return {
    correct,
    total: questions.length,
    score: Math.round((correct / questions.length) * 10_000) / 10_000,
    answers,
    weakConcepts,
  };
}

/** Picks the next quiz difficulty from the learner's latest result. */
export function nextDifficulty(lastScore: number | null): "easier" | "standard" | "harder" {
  if (lastScore === null) return "standard";
  if (lastScore < 0.6) return "easier";
  if (lastScore >= 0.9) return "harder";
  return "standard";
}
