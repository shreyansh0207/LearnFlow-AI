import "server-only";
import { ApiError, FinishReason, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import { readAIConfig, type ThinkingLevelName } from "@/lib/env";

/**
 * Server-side Gemini service (Google's official @google/genai SDK, Gemini API).
 * Every AI feature in LearnFlow goes through generateStructured / generateText,
 * so the API key never leaves the server and all calls share the same limits,
 * timeouts, validation and error handling.
 */

export type AIErrorCode =
  | "not_configured"
  | "rate_limited"
  | "provider_rate_limited"
  | "provider_auth"
  | "model_unavailable"
  | "timeout"
  | "refused"
  | "invalid_output"
  | "provider_error";

export class AIError extends Error {
  constructor(
    public readonly code: AIErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AIError";
  }
}

export const AI_ERROR_STATUS: Record<AIErrorCode, number> = {
  not_configured: 503,
  rate_limited: 429,
  provider_rate_limited: 503,
  provider_auth: 503,
  model_unavailable: 503,
  timeout: 504,
  refused: 422,
  invalid_output: 502,
  provider_error: 502,
};

const TIMEOUT_MS = 100_000;

let cached: { key: string; client: GoogleGenAI } | null = null;

function getClient(apiKey: string): GoogleGenAI {
  if (cached?.key === apiKey) return cached.client;
  // The SDK retries transient failures itself; keep it to one retry so users aren't left waiting.
  const client = new GoogleGenAI({ apiKey, httpOptions: { timeout: TIMEOUT_MS, retryOptions: { attempts: 2 } } });
  cached = { key: apiKey, client };
  return client;
}

function liveConfig() {
  const config = readAIConfig();
  if (config.mode !== "live") throw new AIError("not_configured", "Gemini isn't configured on the server. Add GEMINI_API_KEY to .env.local and restart.");
  return config;
}

const THINKING: Record<ThinkingLevelName, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

/** Extracts Google's readable message and removes anything that could identify the key. */
function safeDetail(message: string): string {
  let text = message;
  try {
    const parsed = JSON.parse(message.slice(message.indexOf("{")));
    if (typeof parsed?.error?.message === "string") text = parsed.error.message;
  } catch {
    // not JSON — use as-is
  }
  return text
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[key]")
    .replace(/AQ\.[0-9A-Za-z_.-]{20,}/g, "[key]")
    .replace(/\s+/g, " ")
    .slice(0, 240);
}

/** Translates SDK/network errors into safe, user-presentable error codes. */
export function mapGeminiError(error: unknown, model: string): AIError {
  if (error instanceof AIError) return error;
  if (error instanceof ApiError) {
    const msg = String(error.message ?? "");
    if (error.status === 429) {
      return new AIError("provider_rate_limited", "Gemini's quota or rate limit was reached. Please wait a minute and try again.");
    }
    if (error.status === 401 || error.status === 403 || /api key not valid|API_KEY_INVALID|API key expired/i.test(msg)) {
      return new AIError("provider_auth", "Gemini rejected the server's credentials. An administrator needs to check GEMINI_API_KEY.");
    }
    if (error.status === 404 || /not found|no longer available|not supported for generateContent/i.test(msg)) {
      return new AIError(
        "model_unavailable",
        `The configured Gemini model "${model}" isn't available to this API key (${safeDetail(msg)}). Set GEMINI_MODEL to a model your key can use; run \`npm run ai:check\` to list them.`,
      );
    }
    if (error.status === 408 || error.status === 504) return new AIError("timeout", "Gemini took too long to respond. Please try again.");
    if (error.status >= 500) return new AIError("provider_error", "Gemini is temporarily unavailable. Please try again shortly.");
    return new AIError("provider_error", "Gemini couldn't process this request. Please try again.");
  }
  const name = (error as { name?: string })?.name ?? "";
  if (name === "AbortError" || name === "TimeoutError" || /aborted|timed? ?out/i.test(String((error as Error)?.message))) {
    return new AIError("timeout", "Gemini took too long to respond. Please try again.");
  }
  if (/fetch failed|ENOTFOUND|ECONNRESET|ECONNREFUSED|network/i.test(String((error as Error)?.message))) {
    return new AIError("provider_error", "Couldn't reach Gemini. Check your internet connection and try again.");
  }
  return new AIError("provider_error", "Unexpected AI error. Please try again.");
}

const BLOCKED = new Set<string>([FinishReason.SAFETY, FinishReason.PROHIBITED_CONTENT, FinishReason.BLOCKLIST, FinishReason.SPII, FinishReason.RECITATION]);

type GenOpts = { system: string; maxTokens: number; json?: object };

async function callGemini(contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>, opts: GenOpts) {
  const config = liveConfig();
  const ai = getClient(config.apiKey);
  let response;
  try {
    response = await ai.models.generateContent({
      model: config.model,
      contents,
      config: {
        systemInstruction: opts.system,
        maxOutputTokens: opts.maxTokens,
        thinkingConfig: { thinkingLevel: THINKING[config.thinking] },
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
        ...(opts.json ? { responseMimeType: "application/json", responseJsonSchema: opts.json } : {}),
      },
    });
  } catch (error) {
    throw mapGeminiError(error, config.model);
  }
  if (response.promptFeedback?.blockReason) {
    throw new AIError("refused", "Gemini declined this request. Try rephrasing the subject or question.");
  }
  const finish = response.candidates?.[0]?.finishReason;
  if (finish && BLOCKED.has(finish)) {
    throw new AIError("refused", "Gemini declined to generate this content. Try rephrasing the subject or question.");
  }
  return { text: response.text ?? "", finish, model: response.modelVersion ?? config.model };
}

/** JSON Schema for Gemini's structured output, derived from the same Zod schema used to validate. */
export function geminiJsonSchema(schema: z.ZodType): object {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "any" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

/**
 * Requests JSON matching `schema` (Gemini structured output), then validates it
 * with Zod. Retries once if the response is truncated or fails validation, and
 * never returns unvalidated data.
 */
export async function generateStructured<S extends z.ZodType>(opts: { schema: S; system: string; prompt: string; maxTokens?: number }): Promise<{ data: z.infer<S>; model: string }> {
  const json = geminiJsonSchema(opts.schema);
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text, finish, model } = await callGemini([{ role: "user", parts: [{ text: opts.prompt }] }], {
      system: opts.system,
      maxTokens: opts.maxTokens ?? 16000,
      json,
    });
    if (finish === FinishReason.MAX_TOKENS || !text) continue;
    try {
      const checked = opts.schema.safeParse(JSON.parse(text));
      if (checked.success) return { data: checked.data, model };
    } catch {
      // invalid JSON — retry once
    }
  }
  throw new AIError("invalid_output", "Gemini returned a response that didn't pass validation, so nothing was saved. Please try again.");
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

/** Free-text generation for tutoring and lesson follow-ups. */
export async function generateText(opts: { system: string; messages: ChatTurn[]; maxTokens?: number }): Promise<{ text: string; model: string }> {
  const contents = opts.messages.map((m) => ({ role: m.role === "assistant" ? ("model" as const) : ("user" as const), parts: [{ text: m.content }] }));
  const { text, model } = await callGemini(contents, { system: opts.system, maxTokens: opts.maxTokens ?? 4000 });
  const trimmed = text.trim();
  if (!trimmed) throw new AIError("invalid_output", "Gemini returned an empty response. Please try again.");
  return { text: trimmed, model };
}

/**
 * Confirms the configured model can actually generate with this key. A model can
 * appear in the model list yet be unavailable for generation, so this makes a
 * tiny real call. Never substitutes another model.
 */
export async function verifyModel(): Promise<{ ok: true; model: string; latencyMs: number } | { ok: false; code: AIErrorCode; message: string }> {
  const started = Date.now();
  try {
    const { model } = await generateText({ system: "Reply with the single word: ready", messages: [{ role: "user", content: "Status check" }], maxTokens: 256 });
    return { ok: true, model, latencyMs: Date.now() - started };
  } catch (e) {
    const err = e instanceof AIError ? e : mapGeminiError(e, readAIConfig().mode === "live" ? (readAIConfig() as { model: string }).model : "unknown");
    return { ok: false, code: err.code, message: err.message };
  }
}

// ---------------------------------------------------------------------------
// Duplicate-call protection: identical concurrent requests share one AI call.
// ---------------------------------------------------------------------------

const inFlight = new Map<string, Promise<unknown>>();

export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = fn().finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}
