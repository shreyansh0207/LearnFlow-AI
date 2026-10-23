/**
 * Environment configuration. Nothing here throws at import time: missing
 * configuration is reported to the user as a readable setup screen instead of
 * crashing the app.
 */

export type EnvCheck<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** Neon Postgres connection (server-only). */
export function readDatabaseEnv(source: Record<string, string | undefined> = process.env): EnvCheck<{ url: string }> {
  const url = source.DATABASE_URL?.trim();
  if (!url) return { ok: false, errors: ["DATABASE_URL is not set (your Neon connection string)"] };
  if (!/^postgres(ql)?:\/\//.test(url)) return { ok: false, errors: ["DATABASE_URL must start with postgres:// or postgresql://"] };
  return { ok: true, value: { url } };
}

export const REASONING_EFFORTS = ["low", "medium", "high"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export type AIConfig =
  | { mode: "live"; provider: "groq"; apiKey: string; model: string; reasoning: ReasoningEffort; rateLimitPerHour: number }
  | { mode: "demo"; rateLimitPerHour: number }
  | { mode: "unconfigured"; reason: string };

/** Used only when GROQ_MODEL is unset; verified available for this key with `npm run ai:check`. */
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

/**
 * Groq configuration, read ONLY from server-side environment variables.
 * The key is never exposed through NEXT_PUBLIC_* variables or client bundles.
 */
export function readAIConfig(source: Record<string, string | undefined> = process.env): AIConfig {
  const apiKey = source.GROQ_API_KEY?.trim();
  const rateLimit = Number.parseInt(source.AI_RATE_LIMIT_PER_HOUR ?? "", 10);
  const rateLimitPerHour = Number.isFinite(rateLimit) && rateLimit > 0 ? rateLimit : 40;

  if (apiKey) {
    const reasoningRaw = (source.GROQ_REASONING_EFFORT ?? "low").trim().toLowerCase() as ReasoningEffort;
    const reasoning = REASONING_EFFORTS.includes(reasoningRaw) ? reasoningRaw : "low";
    const model = source.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;
    return { mode: "live", provider: "groq", apiKey, model, reasoning, rateLimitPerHour };
  }
  if (source.LEARNFLOW_DEMO_MODE?.trim().toLowerCase() === "true") {
    return { mode: "demo", rateLimitPerHour };
  }
  return {
    mode: "unconfigured",
    reason:
      "AI is not configured. Add GROQ_API_KEY (and optionally GROQ_MODEL) to .env.local on the server and restart, or set LEARNFLOW_DEMO_MODE=true to use clearly labelled template content for testing.",
  };
}

export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}
