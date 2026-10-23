import { NextResponse } from "next/server";
import { singleFlight } from "@/lib/ai/client";
import { runSelfTest } from "@/lib/ai/generate";
import { SELF_TEST_PROMPT } from "@/lib/ai/prompts";
import { handleRouteError } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";

export const maxDuration = 120;

/**
 * Sends the fixed compound-interest prompt to Gemini through the real server-side
 * service and returns the generated lesson. Nothing is saved: this is a check.
 */
export async function POST() {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) return auth;
  try {
    const result = await singleFlight(`selftest:${auth.user.id}`, () => runSelfTest({ db: auth.db, userId: auth.user.id }));
    return NextResponse.json({ prompt: SELF_TEST_PROMPT, ...result });
  } catch (err) {
    return handleRouteError(err);
  }
}
