import { describe, expect, it } from "vitest";
import { applyQuizResult, applyReviewResult, computeMastery, masteryStatus, type MasteryState } from "@/lib/learning/mastery";

const fresh: MasteryState = { quizEma: null, recallEma: null, confidence: null, quizAttempts: 0, lessonCompleted: false };

describe("mastery model", () => {
  it("keeps lesson completion separate from mastery", () => {
    const studied = { ...fresh, lessonCompleted: true, confidence: 5 };
    expect(computeMastery(studied)).toBe(0);
    expect(masteryStatus(studied)).toBe("in_progress");
  });

  it("does not let self-reported confidence alone create mastery", () => {
    expect(computeMastery({ ...fresh, confidence: 5 })).toBe(0);
  });

  it("flags a poor quiz result as needing practice", () => {
    const s = applyQuizResult({ ...fresh, lessonCompleted: true }, 0.4);
    expect(masteryStatus(s)).toBe("needs_practice");
  });

  it("requires repeated evidence before calling a topic mastered", () => {
    const once = applyQuizResult(fresh, 1);
    expect(masteryStatus(once)).toBe("proficient");
    const twice = applyQuizResult(once, 1);
    expect(masteryStatus(twice)).toBe("mastered");
  });

  it("weights recent quiz results more heavily (EMA)", () => {
    const s = applyQuizResult(applyQuizResult(fresh, 0.2), 1);
    expect(s.quizEma).toBeCloseTo(0.6, 5);
  });

  it("recovers from needs-practice after improved results", () => {
    let s = applyQuizResult(fresh, 0.3);
    expect(masteryStatus(s)).toBe("needs_practice");
    s = applyQuizResult(s, 1);
    s = applyQuizResult(s, 1);
    expect(masteryStatus(s)).not.toBe("needs_practice");
  });

  it("renormalises weights across available evidence", () => {
    const quizOnly = applyQuizResult(fresh, 0.8);
    expect(computeMastery(quizOnly)).toBeCloseTo(0.8, 3);
    const withRecall = applyReviewResult(quizOnly, "again");
    // 0.6*0.8 + 0.25*0 over 0.85
    expect(computeMastery(withRecall)).toBeCloseTo(0.565, 3);
  });
});
