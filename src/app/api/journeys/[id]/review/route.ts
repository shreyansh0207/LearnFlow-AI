import { NextResponse } from "next/server";
import { reviewCurriculumWithAI } from "@/lib/ai/generate";
import { handleRouteError } from "@/lib/api";
import { jsonError, requireApiUser } from "@/lib/auth";
import { recordJob } from "@/lib/catalog/repository";
import { getJourneyOutline } from "@/lib/data";
import { serviceDb } from "@/lib/db";
import { isUuid } from "@/lib/utils";

export const maxDuration = 90;

/** Runs the AI gap analysis for the active curriculum and stores it on the version. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) return auth;
  const { db, user } = auth;
  const { id } = await params;
  if (!isUuid(id)) return jsonError(404, "not_found", "Journey not found.");

  const outline = await getJourneyOutline(db, id);
  if (!outline?.version) return jsonError(404, "not_found", "This journey has no roadmap yet.");
  const j = outline.journey;
  const text = outline.modules
    .map((m, i) => `Module ${i + 1}: ${m.title} [${m.level}]\n${m.topics.map((t, ti) => `  ${i + 1}.${ti + 1} ${t.title}${t.prerequisites.length ? ` (needs: ${t.prerequisites.join(", ")})` : ""}${t.has_exercise ? " [exercise]" : ""}${t.is_checkpoint ? " [checkpoint]" : ""}`).join("\n")}`)
    .join("\n");

  const started = Date.now();
  const service = serviceDb();
  try {
    const review = await reviewCurriculumWithAI({ db, userId: user.id }, { subject: j.subject, goal: j.goal, currentLevel: j.current_level, targetLevel: j.target_level, outline: text });
    const coverage = { review: review.data, reviewedAt: new Date().toISOString(), model: review.model, versionModules: outline.modules.length };
    try {
      await db.query("update public.curriculum_versions set coverage = $1 where id = $2", [JSON.stringify(coverage), outline.version.id]);
    } catch {
      return jsonError(500, "data_error", "The review finished but couldn't be saved.");
    }
    await recordJob(service, { kind: "review", status: "succeeded", topic: j.subject, durationMs: Date.now() - started });
    return NextResponse.json({ ok: true });
  } catch (err) {
    await recordJob(service, { kind: "review", status: "failed", topic: j.subject, errorCode: (err as { code?: string }).code ?? (err as Error).name, durationMs: Date.now() - started });
    return handleRouteError(err);
  }
}
