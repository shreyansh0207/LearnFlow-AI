import { NextResponse } from "next/server";
import { generateBranches } from "@/lib/ai/generate";
import { handleRouteError } from "@/lib/api";
import { jsonError, requireApiUser } from "@/lib/auth";
import { getNode, recordJob, saveBranches } from "@/lib/catalog/repository";
import { serviceDb } from "@/lib/db";
import { isUuid } from "@/lib/utils";

export const maxDuration = 90;

/** Incrementally grows the catalog: proposes the main branches of one node (saved as unverified). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) return auth;
  const { db, user } = auth;
  const { id } = await params;
  if (!isUuid(id)) return jsonError(404, "not_found", "Topic not found.");

  const service = serviceDb();

  const node = await getNode(db, id);
  if (!node || node.status === "merged") return jsonError(404, "not_found", "Topic not found.");
  const children = await db.query<{ name: string }>("select name from public.knowledge_nodes where parent_id = $1 limit 200", [id]);
  if (children.length >= 40) return jsonError(409, "enough_branches", "This topic already has many branches. Explore them, or expand a more specific branch.");

  const started = Date.now();
  try {
    const branches = await generateBranches({ db, userId: user.id }, { name: node.name, description: node.description, path: node.path, existing: children.map((c) => c.name) });
    const ids = await saveBranches(service, { id: node.id, path: node.path }, branches.data, "ai_generated", user.id);
    await recordJob(service, { kind: "expand", status: "succeeded", topic: node.name, nodeId: node.id, durationMs: Date.now() - started });
    return NextResponse.json({ added: ids.length });
  } catch (err) {
    await recordJob(service, { kind: "expand", status: "failed", topic: node.name, nodeId: node.id, errorCode: (err as { code?: string }).code ?? (err as Error).name, durationMs: Date.now() - started });
    return handleRouteError(err);
  }
}
