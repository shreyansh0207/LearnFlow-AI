import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, parseJson } from "@/lib/api";
import { jsonError, requireApiUser } from "@/lib/auth";
import { findExisting, getNode, insertNode, recordTopicRequest, resolveDomain } from "@/lib/catalog/repository";
import { requestKey } from "@/lib/catalog/text";
import { serviceDb } from "@/lib/db";

const Body = z.object({
  name: z.string().trim().min(2, { message: "Enter a topic name" }).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  parentId: z.uuid().optional().nullable(),
});

const DAILY_LIMIT = 20;

/** A learner suggests a topic. Saved as "user_suggested" + "proposed" until an admin reviews it. */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) return auth;
  const { db, user } = auth;
  const parsed = await parseJson(request, Body);
  if (!parsed.ok) return parsed.response;
  const { name, description, parentId } = parsed.data;

  const service = serviceDb();

  try {
    const count = await service.count(
      "select count(*)::int as count from public.knowledge_nodes where created_by = $1 and origin = 'user_suggested' and created_at > now() - interval '1 day'",
      [user.id],
    );
    if (count >= DAILY_LIMIT) return jsonError(429, "rate_limited", "You've suggested a lot of topics today. Thanks! Please try again tomorrow.");

    const existing = await findExisting(db, name);
    if (existing) return NextResponse.json({ nodeId: existing.match.id, created: false, duplicate: existing.reason });

    const parent = parentId ? await getNode(db, parentId) : null;
    const target = parent && parent.status !== "merged" ? { id: parent.id, path: parent.path } : await resolveDomain(db, null);
    if (!target) return jsonError(500, "catalog_missing", "The catalog hasn't been set up yet.");

    const node = await insertNode(service, { parent: { id: target.id, path: target.path }, name, description: description ?? null, kind: "topic", origin: "user_suggested", createdBy: user.id });
    await recordTopicRequest(service, requestKey(name), name, node.id);
    return NextResponse.json({ nodeId: node.id, created: node.created }, { status: node.created ? 201 : 200 });
  } catch (err) {
    return handleRouteError(err);
  }
}
