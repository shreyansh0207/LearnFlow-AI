// Lists the Groq models available to GROQ_API_KEY, then makes a real call with
// the configured model (a model can be listed yet unusable, e.g. decommissioned).
// Usage: npm run ai:check            (uses GROQ_MODEL, default openai/gpt-oss-120b)
//        npm run ai:check -- --probe model-a,model-b
import Groq from "groq-sdk";

const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
  console.error("GROQ_API_KEY is not set in .env.local");
  process.exitCode = 1;
  throw new Error("missing GROQ_API_KEY");
}
const groq = new Groq({ apiKey, timeout: 60_000, maxRetries: 0 });
const scrub = (s) => String(s).replace(/gsk_[0-9A-Za-z]{20,}/g, "[key]").slice(0, 300);

try {
  const list = await groq.models.list();
  const models = list.data.filter((m) => m.active !== false).sort((a, b) => a.id.localeCompare(b.id));
  console.log(`Groq API: OK — ${models.length} active models`);
  for (const m of models) console.log(`  ${m.id}  (${m.owned_by}, context ${m.context_window})`);
} catch (e) {
  console.error(`Groq API: FAILED — ${e.status ?? ""} ${scrub(e.message)}`);
  process.exitCode = 1;
  throw new Error("model list failed");
}

const probeIdx = process.argv.indexOf("--probe");
const targets = probeIdx > 0 ? process.argv[probeIdx + 1].split(",") : [process.env.GROQ_MODEL || "openai/gpt-oss-120b"];
let failed = false;
for (const model of targets) {
  const started = Date.now();
  try {
    const r = await groq.chat.completions.create({
      model,
      max_completion_tokens: 256,
      ...(/gpt-oss/i.test(model) ? { reasoning_effort: "low", include_reasoning: false } : {}),
      messages: [{ role: "user", content: "Reply with the single word: ready" }],
    });
    console.log(`\n${model}: generates OK (${Date.now() - started} ms) — served as ${r.model}: "${r.choices[0]?.message?.content?.trim()}"`);
  } catch (e) {
    failed = true;
    console.log(`\n${model}: CANNOT GENERATE — ${e.status ?? ""} ${scrub(e.message)}`);
  }
}
process.exitCode = failed ? 1 : 0;
