import "server-only";
import Groq, { APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError } from "groq-sdk";
import type { ChatCompletionCreateParamsNonStreaming, ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";
import { z } from "zod";
import { readAIConfig, type ReasoningEffort } from "@/lib/env";

/**
 * Server-side Groq service (Groq's official groq-sdk). Every AI feature in
 * LearnFlow goes through generateStructured / generateText, so the API key never
 * leaves the server and all calls share the same limits, timeouts, validation
 * and error handling.
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

let cached: { key: string; client: Groq } | null = null;

function getClient(apiKey: string): Groq {
  if (cached?.key === apiKey) return cached.client;
  // The SDK retries 429/5xx itself (honouring retry-after); keep it to one retry so users aren't left waiting.
  const client = new Groq({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
  cached = { key: apiKey, client };
  return client;
}

function liveConfig() {
  const config = readAIConfig();
  if (config.mode !== "live") throw new AIError("not_configured", "Groq isn't configured on the server. Add GROQ_API_KEY to .env.local and restart.");
  return config;
}

/** Reasoning models think before answering; keep that thinking out of the returned content. */
function reasoningParams(model: string, effort: ReasoningEffort): Partial<ChatCompletionCreateParamsNonStreaming> {
  if (/gpt-oss/i.test(model)) return { reasoning_effort: effort, include_reasoning: false };
  if (/qwen3/i.test(model)) return { reasoning_format: "hidden" };
  return {};
}

/** Strict (constrained) JSON-schema decoding is only offered on some Groq models; others get best-effort. */
function supportsStrictSchema(model: string): boolean {
  return /gpt-oss/i.test(model);
}

/** Extracts Groq's readable message and removes anything that could identify the key. */
function safeDetail(message: string): string {
  let text = message;
  try {
    const parsed = JSON.parse(message.slice(message.indexOf("{")));
    if (typeof parsed?.error?.message === "string") text = parsed.error.message;
  } catch {
    // not JSON — use as-is
  }
  return text
    .replace(/gsk_[0-9A-Za-z]{20,}/g, "[key]")
    .replace(/org_[0-9a-z]{10,}/g, "[org]")
    .replace(/\s+/g, " ")
    .slice(0, 240);
}

function errorCode(error: APIError): string {
  const body = error.error as { code?: unknown; error?: { code?: unknown } } | undefined;
  return String(body?.code ?? body?.error?.code ?? "");
}

/** Translates SDK/network errors into safe, user-presentable error codes. */
export function mapGroqError(error: unknown, model: string): AIError {
  if (error instanceof AIError) return error;
  if (error instanceof APIConnectionTimeoutError || error instanceof APIUserAbortError) {
    return new AIError("timeout", "Groq took too long to respond. Please try again.");
  }
  if (error instanceof APIConnectionError) {
    return new AIError("provider_error", "Couldn't reach Groq. Check your internet connection and try again.");
  }
  if (error instanceof APIError) {
    const msg = String(error.message ?? "");
    const code = errorCode(error);
    if (code === "json_validate_failed") {
      return new AIError("invalid_output", "Groq returned a response that didn't match the expected format. Please try again.");
    }
    if (error.status === 413 || /request too large/i.test(msg)) {
      return new AIError("provider_rate_limited", "This request is larger than the Groq plan allows per minute. Please wait a minute and try again.");
    }
    if (error.status === 429) {
      return new AIError("provider_rate_limited", "Groq's rate limit was reached. Please wait a minute and try again.");
    }
    if (error.status === 401 || error.status === 403 || code === "invalid_api_key" || /invalid api key/i.test(msg)) {
      return new AIError("provider_auth", "Groq rejected the server's credentials. An administrator needs to check GROQ_API_KEY.");
    }
    if (error.status === 404 || code === "model_not_found" || code === "model_decommissioned" || /does not exist|decommissioned|do not have access/i.test(msg)) {
      return new AIError(
        "model_unavailable",
        `The configured Groq model "${model}" isn't available to this API key (${safeDetail(msg)}). Set GROQ_MODEL to a model your key can use; run \`npm run ai:check\` to list them.`,
      );
    }
    if (error.status === 408 || error.status === 504) return new AIError("timeout", "Groq took too long to respond. Please try again.");
    if ((error.status ?? 0) >= 500) return new AIError("provider_error", "Groq is temporarily unavailable. Please try again shortly.");
    return new AIError("provider_error", "Groq couldn't process this request. Please try again.");
  }
  const name = (error as { name?: string })?.name ?? "";
  if (name === "AbortError" || name === "TimeoutError" || /aborted|timed? ?out/i.test(String((error as Error)?.message))) {
    return new AIError("timeout", "Groq took too long to respond. Please try again.");
  }
  if (/fetch failed|ENOTFOUND|ECONNRESET|ECONNREFUSED|network/i.test(String((error as Error)?.message))) {
    return new AIError("provider_error", "Couldn't reach Groq. Check your internet connection and try again.");
  }
  return new AIError("provider_error", "Unexpected AI error. Please try again.");
}

type GenOpts = { system: string; maxTokens: number; json?: object };

async function callGroq(turns: ChatTurn[], opts: GenOpts) {
  const config = liveConfig();
  const groq = getClient(config.apiKey);
  const messages: ChatCompletionMessageParam[] = [{ role: "system", content: opts.system }, ...turns.map((t) => ({ role: t.role, content: t.content }))];
  let response;
  try {
    response = await groq.chat.completions.create(
      {
        model: config.model,
        messages,
        max_completion_tokens: opts.maxTokens,
        ...reasoningParams(config.model, config.reasoning),
        ...(opts.json
          ? { response_format: { type: "json_schema" as const, json_schema: { name: "response", strict: supportsStrictSchema(config.model), schema: opts.json as Record<string, unknown> } } }
          : {}),
      },
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
  } catch (error) {
    throw mapGroqError(error, config.model);
  }
  const choice = response.choices[0];
  const finish = choice?.finish_reason as string | undefined;
  if (finish === "content_filter") {
    throw new AIError("refused", "Groq declined to generate this content. Try rephrasing the subject or question.");
  }
  return { text: choice?.message?.content ?? "", finish, model: response.model ?? config.model };
}

/** JSON Schema for Groq's structured output, derived from the same Zod schema used to validate. */
export function toResponseSchema(schema: z.ZodType): object {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "any" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

/**
 * Requests JSON matching `schema` (Groq structured output), then validates it
 * with Zod. Retries once if the response is truncated or fails validation, and
 * never returns unvalidated data.
 */
export async function generateStructured<S extends z.ZodType>(opts: { schema: S; system: string; prompt: string; maxTokens?: number }): Promise<{ data: z.infer<S>; model: string }> {
  const json = toResponseSchema(opts.schema);
  for (let attempt = 0; attempt < 2; attempt++) {
    let result;
    try {
      result = await callGroq([{ role: "user", content: opts.prompt }], { system: opts.system, maxTokens: opts.maxTokens ?? 16000, json });
    } catch (error) {
      if (error instanceof AIError && error.code === "invalid_output") continue;
      throw error;
    }
    const { text, finish, model } = result;
    if (finish === "length" || !text) continue;
    try {
      const checked = opts.schema.safeParse(JSON.parse(text));
      if (checked.success) return { data: checked.data, model };
    } catch {
      // invalid JSON — retry once
    }
  }
  throw new AIError("invalid_output", "Groq returned a response that didn't pass validation, so nothing was saved. Please try again.");
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

/** Free-text generation for tutoring and lesson follow-ups. */
export async function generateText(opts: { system: string; messages: ChatTurn[]; maxTokens?: number }): Promise<{ text: string; model: string }> {
  const { text, model } = await callGroq(opts.messages, { system: opts.system, maxTokens: opts.maxTokens ?? 4000 });
  const trimmed = text.trim();
  if (!trimmed) throw new AIError("invalid_output", "Groq returned an empty response. Please try again.");
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
    const err = e instanceof AIError ? e : mapGroqError(e, readAIConfig().mode === "live" ? (readAIConfig() as { model: string }).model : "unknown");
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
