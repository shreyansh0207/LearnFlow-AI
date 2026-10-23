// Lists the Gemini models available to GEMINI_API_KEY on both endpoints.
// Usage: node --env-file=.env.local scripts/gemini-check.mjs
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY is not set in .env.local");
  process.exit(1);
}

for (const [label, opts] of [
  ["Gemini API (AI Studio)", { apiKey }],
  ["Vertex AI express mode", { apiKey, vertexai: true }],
]) {
  try {
    const ai = new GoogleGenAI(opts);
    const names = [];
    const pager = await ai.models.list({ config: { pageSize: 100 } });
    for await (const m of pager) {
      names.push(m.name);
      if (names.length >= 200) break;
    }
    const gemini = names.filter((n) => /gemini/i.test(n));
    console.log(`\n${label}: OK — ${names.length} models, ${gemini.length} Gemini`);
    console.log(gemini.slice(0, 40).join("\n"));
  } catch (e) {
    console.log(`\n${label}: FAILED — ${e?.status ?? ""} ${String(e?.message ?? e).slice(0, 300)}`);
  }
}

// Verifies generation (listing alone isn't proof a model is usable).
// Default: the configured GEMINI_MODEL. Or: --probe model-a,model-b
const probeIdx = process.argv.indexOf("--probe");
const models = probeIdx > 0 ? process.argv[probeIdx + 1].split(",") : [process.env.GEMINI_MODEL || "gemini-3.5-flash"];
{
  const ai = new GoogleGenAI({ apiKey });
  for (const model of models) {
    const t = Date.now();
    const signal = AbortSignal.timeout(45000);
    try {
      const r = await ai.models.generateContent({
        model,
        contents: "Give one beginner-friendly definition of compound interest.",
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: { type: "object", properties: { term: { type: "string" }, definition: { type: "string" } }, required: ["term", "definition"] },
          maxOutputTokens: 2048,
          abortSignal: signal,
        },
      });
      console.log(`\nPROBE ${model}: OK in ${Date.now() - t} ms, finish=${r.candidates?.[0]?.finishReason}, tokens=${r.usageMetadata?.totalTokenCount}`);
      console.log(r.text?.slice(0, 200));
    } catch (e) {
      console.log(`\nPROBE ${model}: FAILED ${e?.status ?? ""} ${String(e?.message ?? e).slice(0, 200)}`);
    }
  }
}
