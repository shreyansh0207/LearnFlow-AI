import { NextResponse } from "next/server";
import { z } from "zod";
import { generateExpansion } from "@/lib/ai/generate";
import { handleRouteError, parseJson } from "@/lib/api";
import { jsonError, requireApiUser } from "@/lib/auth";
import { recordJob } from "@/lib/catalog/repository";
import { asPattern, sourcesFor } from "@/lib/curriculum/build";
import { getJourneyOutline } from "@/lib/data";
import { appendModules } from "@/lib/learning/service";
import { serviceDb } from "@/lib/db";
import { isUuid } from "@/lib/utils";

export const maxDuration = 120;

const Body = z.object({
  focus: z.string().trim().min(3, { message: "Describe what to add" }).max(200),
  placement: z.enum(["append", "prerequisites"]).default("append"),
});

/**
 * Expands the active curriculum with new modules. Nothing existing is changed,
 * so completed lessons, quiz history and reviews are preserved exactly.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) return auth;
  const { db, user } = auth;
  const { id } = await params;
  if (!isUuid(id)) return jsonError(404, "not_found", "Journey not found.");
  const parsed = await parseJson(request, Body);
  if (!parsed.ok) return parsed.response;

  const outline = await getJourneyOutline(db, id);
  if (!outline || !outline.journey.active_version_id) return jsonError(404, "not_found", "This journey has no roadmap to expand yet.");
  if (outline.modules.length >= 14) return jsonError(409, "too_large", "This roadmap is already large. Consider starting a separate journey for this area.");
  const extra = await db.maybeOne<{ learning_pattern: string | null }>("select learning_pattern from public.learning_journeys where id = $1", [id]);

  const started = Date.now();
  const service = serviceDb();
  try {
    const sources = await sourcesFor(`${parsed.data.focus} ${outline.journey.subject}`);
    const existingOutline = outline.modules.map((m, i) => `${i + 1}. ${m.title} (${m.level}): ${m.topics.map((t) => t.title).join("; ")}`).join("\n");
    const generated = await generateExpansion(
      { db, userId: user.id },
      {
        subject: outline.journey.subject,
        goal: outline.journey.goal,
        targetLevel: outline.journey.target_level,
        focus: parsed.data.focus,
        placement: parsed.data.placement,
        existingOutline,
        pattern: asPattern(extra?.learning_pattern) ?? "mixed",
        sources,
      },
    );
    const cited = new Set(generated.data.modules.flatMap((m) => m.topics.flatMap((t) => t.sourceRefs)));
    const topics = await appendModules(db, {
      userId: user.id,
      journeyId: id,
      versionId: outline.journey.active_version_id,
      modules: generated.data.modules,
      placement: parsed.data.placement,
      focus: parsed.data.focus,
      rationale: generated.data.rationale,
      sources: sources.filter((s) => cited.has(s.ref)),
    });
    await recordJob(service, { kind: "expand_curriculum", status: "succeeded", topic: outline.journey.subject, durationMs: Date.now() - started });
    return NextResponse.json({ added: topics.length, rationale: generated.data.rationale, source: generated.source });
  } catch (err) {
    await recordJob(service, { kind: "expand_curriculum", status: "failed", topic: outline.journey.subject, errorCode: (err as { code?: string }).code ?? (err as Error).name, durationMs: Date.now() - started });
    return handleRouteError(err);
  }
}
