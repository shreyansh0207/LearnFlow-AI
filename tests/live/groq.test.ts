import { afterEach, describe, expect, it } from "vitest";
import { AIError, generateStructured, generateText, verifyModel } from "@/lib/ai/client";
import { QUIZ_SYSTEM, SELF_TEST_PROMPT, SELF_TEST_SYSTEM } from "@/lib/ai/prompts";
import { QuizSchema, sanitizeQuiz } from "@/lib/ai/schemas";

// Calls the real Groq API through LearnFlow's server-side service.
// Run with: LIVE_GROQ=1 npm run test:live   (loads GROQ_API_KEY / GROQ_MODEL from .env.local)
const live = Boolean(process.env.GROQ_API_KEY) && Boolean(process.env.LIVE_GROQ);
const original = { model: process.env.GROQ_MODEL, key: process.env.GROQ_API_KEY };

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore("GROQ_MODEL", original.model);
  restore("GROQ_API_KEY", original.key);
});

describe.skipIf(!live)("live Groq service", () => {
  it("TEST — the configured model is available to this key (real tiny call)", async () => {
    const r = await verifyModel();
    console.log("verifyModel:", r);
    expect(r.ok).toBe(true);
  }, 120_000);

  it("TEST 1 — compound-interest self-test returns a real lesson with an example and three quiz questions", async () => {
    const started = Date.now();
    const { text, model } = await generateText({ system: SELF_TEST_SYSTEM, messages: [{ role: "user", content: SELF_TEST_PROMPT }], maxTokens: 6000 });
    console.log(`\n=== Groq (${model}, ${Date.now() - started} ms) ===\n${text}\n=== end ===`);
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
    process.env.GROQ_MODEL = "learnflow/no-such-model";
    const err = await generateText({ system: "x", messages: [{ role: "user", content: "hi" }], maxTokens: 50 }).catch((e) => e);
    console.log("unavailable model →", err?.code, err?.message);
    expect(err).toBeInstanceOf(AIError);
    expect(err.code).toBe("model_unavailable");
    expect(err.message).toContain("learnflow/no-such-model");
    expect(err.message).not.toMatch(/gsk_/);
  }, 60_000);

  it("TEST 2 — an invalid key is reported as a credentials problem without echoing it", async () => {
    process.env.GROQ_API_KEY = "gsk_InvalidKeyForTestingOnly0000000000000000000000";
    const err = await generateText({ system: "x", messages: [{ role: "user", content: "hi" }], maxTokens: 50 }).catch((e) => e);
    console.log("invalid key →", err?.code, err?.message);
    expect(err).toBeInstanceOf(AIError);
    expect(err.code).toBe("provider_auth");
    expect(err.message).not.toContain("gsk_Invalid");
  }, 60_000);
});

describe("missing credentials", () => {
  it("TEST 4 — no key gives a clear setup message and makes no network call", async () => {
    process.env.GROQ_API_KEY = "";
    const err = await generateText({ system: "x", messages: [{ role: "user", content: "hi" }] }).catch((e) => e);
    expect(err).toBeInstanceOf(AIError);
    expect(err.code).toBe("not_configured");
    expect(err.message).toMatch(/GROQ_API_KEY/);
  });
});
