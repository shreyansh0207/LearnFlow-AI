import { describe, expect, it } from "vitest";
import { openAlex, wikipedia } from "@/lib/sources/providers";
import { retrieveSources } from "@/lib/sources/retrieve";

// Hits real public APIs. Opt-in: LIVE_SOURCES=1 npx vitest run tests/live
describe.skipIf(!process.env.LIVE_SOURCES)("live source providers", () => {
  it("Wikipedia returns reference pages with https URLs", async () => {
    const r = await wikipedia.search("semiconductor fabrication", { limit: 3, signal: AbortSignal.timeout(10000) });
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].url).toMatch(/^https:\/\/en\.wikipedia\.org\//);
    console.log(r.map((x) => `${x.title} — ${x.url}`).join("\n"));
  }, 20000);

  it("OpenAlex returns scholarly works with DOIs", async () => {
    const r = await openAlex.search("elliptic curve cryptography", { limit: 3, signal: AbortSignal.timeout(10000) });
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].url).toMatch(/^https:\/\/doi\.org\//);
    console.log(r.map((x) => `${x.title} (${x.published}) — ${x.url}`).join("\n"));
  }, 20000);

  it("retrieveSources merges providers and numbers refs", async () => {
    const { sources, failed } = await retrieveSources("history of ancient trade routes", { timeoutMs: 10000 });
    console.log(sources.map((s) => `${s.ref} [${s.provider}] ${s.title}`).join("\n"), "failed:", failed);
    expect(sources.length).toBeGreaterThan(0);
    expect(sources[0].ref).toBe("S1");
  }, 20000);
});
