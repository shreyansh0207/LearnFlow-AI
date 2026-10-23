import "server-only";
import { generateCurriculum } from "@/lib/ai/generate";
import { catalogHints, getNode, recordJob } from "@/lib/catalog/repository";
import { LEARNING_PATTERNS, type LearningPattern } from "@/lib/catalog/patterns";
import type { JourneyRow } from "@/lib/data";
import { persistCurriculum } from "@/lib/learning/service";
import { retrieveSources } from "@/lib/sources/retrieve";
import type { SourceDoc } from "@/lib/sources/types";
import { serviceDb } from "@/lib/db";
import type { Db } from "@/lib/db";

export function asPattern(value: string | null | undefined): LearningPattern | null {
  return value && (LEARNING_PATTERNS as readonly string[]).includes(value) ? (value as LearningPattern) : null;
}

/** Sources for a topic; failures are logged and never block generation. */
export async function sourcesFor(topic: string): Promise<SourceDoc[]> {
  const started = Date.now();
  const service = serviceDb();
  try {
    const { sources, failed } = await retrieveSources(topic);
    await recordJob(service, { kind: "retrieve", status: failed.length && !sources.length ? "failed" : "succeeded", topic, errorCode: failed.length ? `unavailable:${failed.join(",")}` : null, durationMs: Date.now() - started });
    return sources;
  } catch {
    await recordJob(service, { kind: "retrieve", status: "failed", topic, errorCode: "exception", durationMs: Date.now() - started });
    return [];
  }
}

/**
 * Staged curriculum generation for a journey: resolve the course shape, gather
 * catalog hints and retrieved sources, generate + validate, then persist as a new
 * version (progress carries over). Throws AIError/DataError; nothing is saved
 * unless the whole curriculum validated.
 */
export async function buildCurriculum(db: Db, userId: string, j: JourneyRow & { knowledge_node_id?: string | null; learning_pattern?: string | null; scope_notes?: string | null }) {
  const started = Date.now();
  const service = serviceDb();
  const node = j.knowledge_node_id ? await getNode(db, j.knowledge_node_id) : null;
  const pattern = asPattern(j.learning_pattern) ?? asPattern(node?.learning_pattern) ?? "mixed";
  const [hints, sources] = await Promise.all([node ? catalogHints(db, node.id) : Promise.resolve(null), sourcesFor(node?.name ?? j.subject)]);

  try {
    const generated = await generateCurriculum(
      { db, userId },
      {
        brief: {
          subject: j.subject,
          goal: j.goal,
          motivation: j.motivation,
          currentLevel: j.current_level,
          targetLevel: j.target_level,
          minutesPerDay: j.minutes_per_day,
          daysPerWeek: j.days_per_week,
          learningStyles: j.learning_styles,
          deadline: j.deadline,
          scopeNotes: j.scope_notes ?? null,
        },
        pattern,
        catalogHints: hints,
        sources,
      },
    );
    // Only keep sources the curriculum actually cites (topics or resources).
    const cited = new Set([...generated.data.modules.flatMap((m) => m.topics.flatMap((t) => t.sourceRefs)), ...generated.data.resources.map((r) => r.sourceRef).filter(Boolean)]);
    const usedSources = generated.source === "ai" ? sources.filter((s) => cited.has(s.ref)) : [];
    const versionId = await persistCurriculum(db, userId, j.id, generated.data, generated.source, generated.model, usedSources);
    await recordJob(service, { kind: "curriculum", status: "succeeded", topic: j.subject, nodeId: node?.id ?? null, durationMs: Date.now() - started });
    return { versionId, source: generated.source, sourceCount: usedSources.length };
  } catch (err) {
    await recordJob(service, { kind: "curriculum", status: "failed", topic: j.subject, nodeId: node?.id ?? null, errorCode: (err as { code?: string }).code ?? (err as Error).name, durationMs: Date.now() - started });
    throw err;
  }
}
