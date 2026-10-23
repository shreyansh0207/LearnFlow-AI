import { describe, expect, it } from "vitest";
import { nextDifficulty, scoreSubmission, type ScorableQuestion } from "@/lib/learning/scoring";

const q = (id: string, correct: number, concept: string | null = null): ScorableQuestion => ({
  id,
  correct_index: correct,
  options: ["a", "b", "c", "d"],
  concept,
  prompt: `Question ${id}`,
  explanation: null,
});

describe("scoreSubmission", () => {
  const questions = [q("1", 0, "compound interest"), q("2", 2, "simple interest"), q("3", 3, "compound interest"), q("4", 1)];

  it("scores correct answers against the stored key", () => {
    const r = scoreSubmission(questions, { "1": 0, "2": 2, "3": 3, "4": 1 });
    expect(r).toMatchObject({ correct: 4, total: 4, score: 1, weakConcepts: [] });
  });

  it("counts wrong, unanswered and out-of-range selections as incorrect", () => {
    const r = scoreSubmission(questions, { "1": 1, "2": null, "3": 9 });
    expect(r.correct).toBe(0);
    expect(r.score).toBe(0);
    expect(r.answers.map((a) => a.selectedIndex)).toEqual([1, null, null, null]);
  });

  it("rejects non-integer selections", () => {
    const r = scoreSubmission([q("1", 1)], { "1": 1.5 as number });
    expect(r.correct).toBe(0);
  });

  it("ranks weak concepts by number of mistakes", () => {
    const r = scoreSubmission(questions, { "1": 1, "2": 0, "3": 0, "4": 1 });
    expect(r.correct).toBe(1);
    expect(r.score).toBe(0.25);
    expect(r.weakConcepts).toEqual(["compound interest", "simple interest"]);
  });

  it("ignores answers to questions that are not in the quiz", () => {
    const r = scoreSubmission([q("1", 0)], { "1": 0, injected: 0 });
    expect(r.total).toBe(1);
    expect(r.correct).toBe(1);
  });

  it("refuses to score an empty quiz", () => {
    expect(() => scoreSubmission([], {})).toThrow();
  });
});

describe("nextDifficulty", () => {
  it("adapts to the latest score", () => {
    expect(nextDifficulty(null)).toBe("standard");
    expect(nextDifficulty(0.4)).toBe("easier");
    expect(nextDifficulty(0.75)).toBe("standard");
    expect(nextDifficulty(0.95)).toBe("harder");
  });
});
