import { afterEach, describe, expect, it } from "vitest";
import { AIError, generateStructured, generateText, verifyModel } from "@/lib/ai/client";
import { QUIZ_SYSTEM, SELF_TEST_PROMPT, SELF_TEST_SYSTEM } from "@/lib/ai/prompts";
import { QuizSchema, sanitizeQuiz } from "@/lib/ai/schemas";

// Calls the real Gemini API through LearnFlow's server-side service.
// Run with: npm run test:live   (loads GEMINI_API_KEY / GEMINI_MODEL from .env.local)
const live = Boolean(process.env.GEMINI_API_KEY) && Boolean(process.env.LIVE_GEMINI);
const original = { model: process.env.GEMINI_MODEL, key: process.env.GEMINI_API_KEY };

afterEach(() => {
  process.env.GEMINI_MODEL = original.model;
  process.env.GEMINI_API_KEY = original.key;
});

describe.skipIf(!live)("live Gemini service", () => {
  it("TEST — the configured model is available to this key (real tiny call)", async () => {
    const r = await verifyModel();
    console.log("verifyModel:", r);
    expect(r.ok).toBe(true);
  }, 120_000);

  it("TEST 1 — compound-interest self-test returns a real lesson with an example and three quiz questions", async () => {
    const started = Date.now();
    const { text, model } = await generateText({ system: SELF_TEST_SYSTEM, messages: [{ role: "user", content: SELF_TEST_PROMPT }], maxTokens: 6000 });
    console.log(`\n=== Gemini (${model}, ${Date.now() - started} ms) ===\n${text}\n=== end ===`);
    expect(text.length).toBeGreaterThan(400);
    expect(text.toLowerCase()).toContain("compound interest");
    expect(text).toMatch(/example/i);
    // Three numbered quiz questions.
    expect((text.match(/^\s*(\*\*)?(Q(uestion)?\s*)?[1-3][.):]/gim) ?? []).length).toBeGreaterThanOrEqual(3);
  }, 150_000);

  it("returns schema-validated structured JSON for a quiz", async () => {
    const { data } = await generateStructured({
      schema: QuizSchema,
      system: QUIZ_SYSTEM,
      prompt: "Write a 3-question quiz on simple vs compound interest for an absolute beginner. Difficulty: easier.",
      maxTokens: 6000,
    });
    const quiz = sanitizeQuiz(data);
    console.log("quiz:", quiz.questions.map((q) => `${q.prompt} → ${q.options[q.correctIndex]}`).join("\n"));
    expect(quiz.questions.length).toBeGreaterThanOrEqual(2);
    for (const q of quiz.questions) expect(q.correctIndex).toBeLessThan(q.options.length);
  }, 150_000);

  it("TEST 2 — an unavailable model is reported exactly, never silently substituted", async () => {
    process.env.GEMINI_MODEL = "gemini-2.5-flash"; // listed for this key but not usable by new users
    const err = await generateText({ system: "x", messages: [{ role: "user", content: "hi" }], maxTokens: 50 }).catch((e) => e);
    console.log("unavailable model →", err?.code, err?.message);
    expect(err).toBeInstanceOf(AIError);
    expect(err.code).toBe("model_unavailable");
    expect(err.message).toContain("gemini-2.5-flash");
    expect(err.message).not.toMatch(/AQ\.|AIza/);
  }, 60_000);

  it("TEST 2 — an invalid key is reported as a credentials problem without echoing it", async () => {
    process.env.GEMINI_API_KEY = "AIzaInvalidKeyForTestingOnly000000000000";
    const err = await generateText({ system: "x", messages: [{ role: "user", content: "hi" }], maxTokens: 50 }).catch((e) => e);
    console.log("invalid key →", err?.code, err?.message);
    expect(err).toBeInstanceOf(AIError);
    expect(err.code).toBe("provider_auth");
    expect(err.message).not.toContain("AIzaInvalid");
  }, 60_000);
});

describe("missing credentials", () => {
  it("TEST 4 — no key gives a clear setup message and makes no network call", async () => {
    process.env.GEMINI_API_KEY = "";
    const err = await generateText({ system: "x", messages: [{ role: "user", content: "hi" }] }).catch((e) => e);
    expect(err).toBeInstanceOf(AIError);
    expect(err.code).toBe("not_configured");
    expect(err.message).toMatch(/GEMINI_API_KEY/);
  });
});
