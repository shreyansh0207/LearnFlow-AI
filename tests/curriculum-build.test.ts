import { beforeEach, describe, expect, it, vi } from "vitest";
import { AIError } from "@/lib/ai/client";
import { InvalidAIOutputError } from "@/lib/ai/schemas";

// The pipeline's collaborators are mocked so we can observe ordering:
// nothing may be persisted unless generation AND validation succeeded.
const generateCurriculum = vi.fn();
const persistCurriculum = vi.fn();
const retrieveSources = vi.fn();

vi.mock("@/lib/ai/generate", () => ({ generateCurriculum: (...a: unknown[]) => generateCurriculum(...a) }));
vi.mock("@/lib/learning/service", () => ({ persistCurriculum: (...a: unknown[]) => persistCurriculum(...a) }));
vi.mock("@/lib/sources/retrieve", () => ({ retrieveSources: (...a: unknown[]) => retrieveSources(...a) }));
// Job logging goes to the owner connection; capture it instead of touching a database.
const jobLog: unknown[][] = [];
vi.mock("@/lib/db", () => ({ serviceDb: () => ({ query: async (_sql: string, params: unknown[]) => (jobLog.push(params), []) }) }));

const { buildCurriculum } = await import("@/lib/curriculum/build");

const journey = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Kintsugi",
  subject: "Kintsugi",
  goal: "Repair a bowl",
  motivation: null,
  current_level: "none",
  target_level: "beginner",
  minutes_per_day: 20,
  days_per_week: 5,
  learning_styles: [],
  deadline: null,
  status: "draft",
  active_version_id: null,
  last_topic_id: null,
  last_studied_at: null,
  created_at: "2026-10-24",
  knowledge_node_id: null,
  learning_pattern: "hands_on",
};

const db = {} as never;

const source = (ref: string) => ({ ref, provider: "Wikipedia", type: "reference", url: `https://en.wikipedia.org/wiki/${ref}`, title: ref, snippet: null, authors: null, published: null, license: null, retrievedAt: "2026-10-24T00:00:00Z" });

beforeEach(() => {
  generateCurriculum.mockReset();
  persistCurriculum.mockReset();
  retrieveSources.mockReset().mockResolvedValue({ sources: [source("S1"), source("S2")], attempted: ["Wikipedia"], failed: [] });
});

describe("TEST I — failed generation never saves or reports success", () => {
  it("records failed generation jobs for observability", async () => {
    jobLog.length = 0;
    generateCurriculum.mockRejectedValue(new AIError("provider_rate_limited", "quota"));
    await expect(buildCurriculum(db, "u", journey)).rejects.toBeInstanceOf(AIError);
    expect(jobLog.some((p) => p[0] === "curriculum" && p[1] === "failed" && p[4] === "provider_rate_limited")).toBe(true);
  });

  it("does not persist when the AI provider fails", async () => {
    generateCurriculum.mockRejectedValue(new AIError("timeout", "slow"));
    await expect(buildCurriculum(db, "u", journey)).rejects.toBeInstanceOf(AIError);
    expect(persistCurriculum).not.toHaveBeenCalled();
  });

  it("does not persist when the AI output fails validation", async () => {
    generateCurriculum.mockRejectedValue(new InvalidAIOutputError("no modules"));
    await expect(buildCurriculum(db, "u", journey)).rejects.toBeInstanceOf(InvalidAIOutputError);
    expect(persistCurriculum).not.toHaveBeenCalled();
  });

  it("propagates persistence failures instead of claiming success", async () => {
    generateCurriculum.mockResolvedValue({ data: { modules: [], resources: [] }, source: "ai", model: "m" });
    persistCurriculum.mockRejectedValue(new Error("db down"));
    await expect(buildCurriculum(db, "u", journey)).rejects.toThrow("db down");
  });
});

describe("source-aware generation", () => {
  it("passes retrieved sources and the course shape to the model, and stores only the sources it cites", async () => {
    generateCurriculum.mockResolvedValue({
      data: { modules: [{ topics: [{ sourceRefs: ["S2"] }] }], resources: [{ sourceRef: null }] },
      source: "ai",
      model: "m",
    });
    persistCurriculum.mockResolvedValue("version-1");
    const r = await buildCurriculum(db, "u", journey);
    const input = generateCurriculum.mock.calls[0][1];
    expect(input.pattern).toBe("hands_on");
    expect(input.sources.map((s: { ref: string }) => s.ref)).toEqual(["S1", "S2"]);
    const storedSources = persistCurriculum.mock.calls[0][6];
    expect(storedSources.map((s: { ref: string }) => s.ref)).toEqual(["S2"]);
    expect(r).toEqual({ versionId: "version-1", source: "ai", sourceCount: 1 });
  });

  it("keeps generating when source retrieval fails", async () => {
    retrieveSources.mockRejectedValue(new Error("network"));
    generateCurriculum.mockResolvedValue({ data: { modules: [], resources: [] }, source: "ai", model: "m" });
    persistCurriculum.mockResolvedValue("v");
    await buildCurriculum(db, "u", journey);
    expect(generateCurriculum.mock.calls[0][1].sources).toEqual([]);
  });

  it("never attaches sources to demo/template content", async () => {
    generateCurriculum.mockResolvedValue({ data: { modules: [{ topics: [{ sourceRefs: ["S1"] }] }], resources: [] }, source: "demo", model: null });
    persistCurriculum.mockResolvedValue("v");
    await buildCurriculum(db, "u", journey);
    expect(persistCurriculum.mock.calls[0][6]).toEqual([]);
  });
});
