import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { AIError, AI_ERROR_STATUS } from "@/lib/ai/client";
import { InvalidAIOutputError } from "@/lib/ai/schemas";
import { jsonError } from "@/lib/auth";
import { DataError } from "@/lib/learning/service";

export async function parseJson<S extends z.ZodType>(request: Request, schema: S): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: NextResponse }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: jsonError(400, "invalid_json", "The request body must be valid JSON.") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, response: jsonError(400, "invalid_input", parsed.error.issues[0]?.message ?? "Invalid input.") };
  }
  return { ok: true, data: parsed.data };
}

/** Converts known errors into safe JSON responses; unknown errors become a generic 500. */
export function handleRouteError(error: unknown) {
  if (error instanceof AIError) return jsonError(AI_ERROR_STATUS[error.code], error.code, error.message);
  // AI output that failed validation is never saved; tell the user plainly.
  if (error instanceof InvalidAIOutputError) return jsonError(502, "invalid_output", "The AI returned a structure that didn't pass validation, so nothing was saved. Please try again.");
  if (error instanceof DataError) return jsonError(500, "data_error", error.message);
  console.error("[learnflow] unhandled route error", error);
  return jsonError(500, "server_error", "Something went wrong. Please try again.");
}
