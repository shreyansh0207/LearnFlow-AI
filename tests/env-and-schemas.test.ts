import { describe, expect, it } from "vitest";
import { readAIConfig, readDatabaseEnv } from "@/lib/env";
import { InvalidAIOutputError, sanitizeCurriculum, sanitizeQuiz, type Curriculum } from "@/lib/ai/schemas";
import { JourneyInputSchema } from "@/lib/validation";
import { safeNextPath, topicKey } from "@/lib/utils";

describe("environment validation", () => {
  it("TEST 4 — missing database credentials produce a clear setup message", () => {
    const r = readDatabaseEnv({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/DATABASE_URL is not set/);
  });

  it("rejects a connection string that isn't Postgres", () => {
    expect(readDatabaseEnv({ DATABASE_URL: "mysql://x" }).ok).toBe(false);
    expect(readDatabaseEnv({ DATABASE_URL: "postgresql://u:p@ep-x-pooler.neon.tech/db?sslmode=require" }).ok).toBe(true);
  });

  it("TEST 4 — missing Gemini credentials produce a clear setup message, never a silent fake", () => {
    const r = readAIConfig({});
    expect(r.mode).toBe("unconfigured");
    if (r.mode === "unconfigured") expect(r.reason).toMatch(/GEMINI_API_KEY/);
    expect(readAIConfig({ LEARNFLOW_DEMO_MODE: "true" }).mode).toBe("demo");
  });

  it("reads the Gemini key and model from server env only, with a documented default model", () => {
    expect(readAIConfig({ GEMINI_API_KEY: "k", GEMINI_MODEL: "gemini-x" })).toMatchObject({ mode: "live", provider: "gemini", model: "gemini-x", thinking: "low" });
    expect(readAIConfig({ GEMINI_API_KEY: "k" })).toMatchObject({ model: "gemini-3.5-flash" });
    expect(readAIConfig({ GEMINI_API_KEY: "k", GEMINI_THINKING_LEVEL: "bogus" })).toMatchObject({ thinking: "low" });
    // A NEXT_PUBLIC_ variable must never be treated as the key.
    expect(readAIConfig({ NEXT_PUBLIC_GEMINI_API_KEY: "leak" }).mode).toBe("unconfigured");
  });
});

describe("AI output sanitizing", () => {
  it("drops quiz questions whose answer index is invalid", () => {
    const q = sanitizeQuiz({
      questions: [
        { prompt: "ok", options: ["a", "b"], correctIndex: 1, explanation: "", concept: "c" },
        { prompt: "bad index", options: ["a", "b"], correctIndex: 5, explanation: "", concept: "c" },
        { prompt: "ok2", options: ["a", "b", "c"], correctIndex: 0, explanation: "", concept: "c" },
        { prompt: "one option", options: ["a"], correctIndex: 0, explanation: "", concept: "c" },
      ],
    });
    expect(q.questions.map((x) => x.prompt)).toEqual(["ok", "ok2"]);
  });

  it("rejects a quiz with fewer than two usable questions", () => {
    expect(() => sanitizeQuiz({ questions: [{ prompt: "x", options: ["a", "b"], correctIndex: 9, explanation: "", concept: "" }] })).toThrow(InvalidAIOutputError);
  });

  it("repairs curriculum durations and removes empty modules", () => {
    const raw: Curriculum = {
      title: "T",
      summary: "S",
      learningPattern: "mixed",
      outcomes: [],
      prerequisites: [],
      resources: [],
      limitations: [],
      modules: [
        { title: "Empty", kind: "core", level: "beginner", description: "", milestone: "", topics: [] },
        {
          title: "M",
          kind: "core",
          level: "beginner",
          description: "",
          milestone: "",
          topics: [{ title: "Topic", kind: "concept", sourceRefs: ["S1", "S9"], safetyNote: null, summary: "", objectives: ["", "Do x"], prerequisites: [], estimatedMinutes: 9999, hasExercise: true, isCheckpoint: false }],
        },
      ],
    };
    const c = sanitizeCurriculum(raw, new Set(["S1"]));
    // Citations survive only if they name a source that was actually retrieved.
    expect(c.modules[0].topics[0].sourceRefs).toEqual(["S1"]);
    expect(c.modules).toHaveLength(1);
    expect(c.modules[0].topics[0].estimatedMinutes).toBe(240);
    expect(c.modules[0].topics[0].objectives).toEqual(["Do x"]);
  });
});

describe("input validation", () => {
  it("requires a subject and applies defaults to optional answers", () => {
    expect(JourneyInputSchema.safeParse({ subject: "" }).success).toBe(false);
    const ok = JourneyInputSchema.parse({ subject: "Personal finance", goal: "", deadline: "" });
    expect(ok).toMatchObject({ goal: null, deadline: null, currentLevel: "none", minutesPerDay: 20 });
  });

  it("blocks open redirects in ?next=", () => {
    expect(safeNextPath("/lesson/1")).toBe("/lesson/1");
    expect(safeNextPath("//evil.com")).toBe("/dashboard");
    expect(safeNextPath("https://evil.com")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.com")).toBe("/dashboard");
  });

  it("matches topics across curriculum versions by normalised title", () => {
    expect(topicKey("Simple & Compound Interest!")).toBe(topicKey("simple compound interest"));
  });
});
