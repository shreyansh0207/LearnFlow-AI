import { describe, expect, it } from "vitest";
import { nextTopicInOrder, recommendActions, welcomeBackMessage } from "@/lib/learning/recommend";

describe("nextTopicInOrder", () => {
  it("returns the first unfinished topic in curriculum order", () => {
    const t = (id: string, moduleIndex: number, position: number, lessonCompleted: boolean) => ({
      id,
      title: id,
      moduleIndex,
      position,
      lessonCompleted,
      status: "not_started" as const,
      estimatedMinutes: 10,
    });
    expect(nextTopicInOrder([t("m2t0", 1, 0, false), t("m1t1", 0, 1, false), t("m1t0", 0, 0, true)])?.id).toBe("m1t1");
    expect(nextTopicInOrder([t("a", 0, 0, true)])).toBeNull();
  });
});

describe("recommendActions", () => {
  it("prompts a new user to create a journey", () => {
    expect(recommendActions({ hasJourney: false, dueReviews: 3, practiceTopic: null, nextTopic: null })[0].kind).toBe("create");
  });

  it("puts targeted practice for low mastery before reviews and new lessons", () => {
    const actions = recommendActions({
      hasJourney: true,
      dueReviews: 4,
      practiceTopic: { id: "p", title: "Compound interest" },
      nextTopic: { id: "n", title: "Budgeting" },
    });
    expect(actions.map((a) => a.kind)).toEqual(["practice", "review", "lesson"]);
  });

  it("recognises a finished journey", () => {
    expect(recommendActions({ hasJourney: true, dueReviews: 0, practiceTopic: null, nextTopic: null })[0].kind).toBe("done");
  });
});

describe("welcomeBackMessage", () => {
  it("returns null without real history so no activity is ever invented", () => {
    expect(welcomeBackMessage({ name: "Asha", lastLesson: null, lastQuiz: null, practiceTopic: null })).toBeNull();
  });

  it("is built only from saved data", () => {
    const msg = welcomeBackMessage({
      name: null,
      lastLesson: { title: "Simple and compound interest", when: "yesterday" },
      lastQuiz: { topicTitle: "Simple and compound interest", score: 0.4, weakConcepts: ["compound interest"] },
      practiceTopic: { title: "Simple and compound interest" },
    });
    expect(msg).toContain("Simple and compound interest");
    expect(msg).toContain("40%");
    expect(msg).toContain("compound interest");
    expect(msg).toContain("revise");
  });
});
