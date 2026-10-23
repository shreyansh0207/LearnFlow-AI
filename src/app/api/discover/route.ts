import { NextResponse } from "next/server";
import { z } from "zod";
import { AIError } from "@/lib/ai/client";
import { proposeTopic, interpretGoal } from "@/lib/ai/generate";
import { handleRouteError, parseJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { planDiscovery } from "@/lib/catalog/plan";
import { linkRelated, listDomains, recordJob, recordTopicRequest, resolveDomain, saveProposal, searchMany } from "@/lib/catalog/repository";
import { requestKey } from "@/lib/catalog/text";
import { sourcesFor } from "@/lib/curriculum/build";
import { readAIConfig } from "@/lib/env";
import { serviceDb } from "@/lib/db";
import { topicKey } from "@/lib/utils";

export const maxDuration = 120;

const Body = z.object({
  query: z.string().trim().min(2, { message: "Tell us what you'd like to learn" }).max(300),
  clarification: z.string().trim().max(200).optional().nullable(),
});

/**
 * Universal topic discovery:
 * interpret → search the catalog → (clarify | explore | use existing | propose).
 * New topics are validated, de-duplicated, and saved as UNVERIFIED proposals.
 */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) return auth;
  const { db, user } = auth;
  const parsed = await parseJson(request, Body);
  if (!parsed.ok) return parsed.response;
  const { query } = parsed.data;
  const clarification = parsed.data.clarification || null;
  const service = serviceDb();
  const ctx = { db, userId: user.id };

  try {
    const domains = await listDomains(db);
    const started = Date.now();
    const interpreted = await interpretGoal(ctx, { query, clarification, domains: domains.map((d) => d.name) });
    const interpretation = interpreted.data;
    if (interpreted.source === "ai") await recordJob(service, { kind: "interpret", status: "succeeded", topic: interpretation.topic, durationMs: Date.now() - started });

    const hits = await searchMany(db, [interpretation.topic, ...interpretation.alternativeNames, ...(interpreted.source === "ai" ? [] : [query])]);
    const plan = planDiscovery(interpretation, hits, { clarified: Boolean(clarification) });
    const alternatives = hits.slice(0, 6);
    const reqKey = requestKey(interpretation.topic);

    switch (plan.action) {
      case "clarify":
        return NextResponse.json({ type: "clarify", question: plan.question, options: plan.options, interpretation });
      case "reject":
        return NextResponse.json({
          type: "rejected",
          message:
            plan.reason === "unsafe"
              ? "LearnFlow can't help with that request. If you meant to study a related subject (for example its history or safety), try rephrasing."
              : "That doesn't look like something to learn yet. Try a subject, skill, profession, hobby or question — e.g. “how aircraft engines work”.",
        });
      case "explore":
      case "use_existing":
        await recordTopicRequest(service, reqKey, interpretation.topic, plan.node.id);
        return NextResponse.json({ type: plan.action === "explore" ? "explore" : "matched", nodeId: plan.node.id, node: plan.node, alternatives, interpretation });
    }

    // Not in the catalog yet: build a proposal.
    const config = readAIConfig();
    if (config.mode === "unconfigured") {
      await recordTopicRequest(service, reqKey, interpretation.topic, null);
      return NextResponse.json({ type: "not_found", interpretation, alternatives, message: config.reason });
    }

    const domain = await resolveDomain(db, interpretation.domain);
    const disciplines = domain
      ? await db.query<{ id: string; name: string; path: string }>("select id, name, path from public.knowledge_nodes where parent_id = $1 and status <> 'rejected' limit 60", [domain.id])
      : [];
    const candidates = [...plan.candidates.map((c) => ({ id: c.id, name: c.name, path: c.path })), ...disciplines];

    const proposeStarted = Date.now();
    const sources = config.mode === "live" ? await sourcesFor(interpretation.topic) : [];
    let proposal;
    try {
      proposal = await proposeTopic(ctx, {
        topic: interpretation.topic,
        goal: interpretation.goalSummary,
        domain: domain?.name ?? interpretation.domain,
        candidates: Array.from(new Set(candidates.map((c) => c.name))).slice(0, 60),
        sources,
      });
    } catch (err) {
      await recordJob(service, { kind: "propose", status: "failed", topic: interpretation.topic, errorCode: err instanceof AIError ? err.code : "error", durationMs: Date.now() - proposeStarted });
      throw err;
    }

    // Demo content is never written to the shared catalog.
    if (proposal.source === "demo" || !service || !domain) {
      await recordTopicRequest(service, reqKey, interpretation.topic, null);
      return NextResponse.json({
        type: "proposal_preview",
        proposal: proposal.data,
        source: proposal.source,
        sources,
        interpretation,
        alternatives,
        persisted: false,
        reason: proposal.source === "demo" ? "demo" : "catalog_writes_disabled",
      });
    }

    const parent = candidates.find((c) => proposal.data.parentName && topicKey(c.name) === topicKey(proposal.data.parentName)) ?? domain;
    const saved = await saveProposal(service, proposal.data, { parent: { id: parent.id, path: parent.path }, origin: "ai_generated", createdBy: user.id, sources });

    // Interdisciplinary topics are linked to every domain they draw on.
    const related = (await Promise.all(interpretation.relatedDomains.map((d) => resolveDomain(db, d)))).filter((d) => d && d.id !== domain.id).map((d) => d!.id);
    if (related.length) await linkRelated(service, saved.nodeId, related, "ai_generated");

    await recordJob(service, { kind: "propose", status: "succeeded", topic: proposal.data.name, nodeId: saved.nodeId, durationMs: Date.now() - proposeStarted });
    await recordTopicRequest(service, reqKey, interpretation.topic, saved.nodeId);
    return NextResponse.json({ type: "proposed", nodeId: saved.nodeId, created: saved.created, interpretation, alternatives });
  } catch (err) {
    return handleRouteError(err);
  }
}
