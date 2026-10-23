import { NextResponse } from "next/server";
import { verifyModel } from "@/lib/ai/client";
import { requireApiUser } from "@/lib/auth";
import { readAIConfig } from "@/lib/env";

type Status = Awaited<ReturnType<typeof verifyModel>> & { checkedAt: string };
let cache: { key: string; at: number; status: Status } | null = null;
const TTL_MS = 10 * 60_000;

/**
 * Reports whether the configured Gemini model can actually generate with this key.
 * (A model can be listed yet unavailable, so this makes a tiny real call, cached
 * for 10 minutes.) The key itself is never returned.
 */
export async function GET() {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) return auth;
  const config = readAIConfig();
  if (config.mode !== "live") {
    return NextResponse.json({ provider: "gemini", configured: false, mode: config.mode, message: config.mode === "unconfigured" ? config.reason : "Demo mode: Gemini isn't called." });
  }
  const key = `${config.model}`;
  if (!cache || cache.key !== key || Date.now() - cache.at > TTL_MS) {
    cache = { key, at: Date.now(), status: { ...(await verifyModel()), checkedAt: new Date().toISOString() } };
  }
  return NextResponse.json({ provider: "gemini", configured: true, model: config.model, thinking: config.thinking, ...cache.status });
}
