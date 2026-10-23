import "server-only";
import type { Db } from "@/lib/db";
import { AIError } from "./client";

/**
 * Per-user sliding-window limit on AI calls, stored in Postgres so it holds
 * across serverless instances. The request is recorded before the Groq call.
 */
export async function enforceAIRateLimit(db: Db, userId: string, kind: string, limitPerHour: number) {
  let count: number;
  try {
    count = await db.count("select count(*)::int as count from public.ai_requests where user_id = $1 and created_at > now() - interval '1 hour'", [userId]);
  } catch {
    throw new AIError("provider_error", "Could not verify usage limits. Please try again.");
  }
  if (count >= limitPerHour) {
    throw new AIError("rate_limited", `You've reached the limit of ${limitPerHour} AI requests per hour. Please take a break and try again soon.`);
  }
  await db.query("insert into public.ai_requests (user_id, kind) values ($1, $2)", [userId, kind.slice(0, 60)]);
}
