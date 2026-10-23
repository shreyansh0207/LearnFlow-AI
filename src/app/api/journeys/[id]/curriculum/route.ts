import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api";
import { jsonError, requireApiUser } from "@/lib/auth";
import { buildCurriculum } from "@/lib/curriculum/build";
import { JOURNEY_COLUMNS, type JourneyRow } from "@/lib/data";
import { isUuid } from "@/lib/utils";
import { singleFlight } from "@/lib/ai/client";

export const maxDuration = 120;

/** Generates (or regenerates) a curriculum as a new version. Earlier versions and their history are kept. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) return auth;
  const { db, user } = auth;
  const { id } = await params;
  if (!isUuid(id)) return jsonError(404, "not_found", "Journey not found.");

  const data = await db.maybeOne<JourneyRow & { knowledge_node_id: string | null; learning_pattern: string | null; scope_notes: string | null }>(
    `select ${JOURNEY_COLUMNS}, knowledge_node_id, learning_pattern, scope_notes from public.learning_journeys where id = $1`,
    [id],
  );
  if (!data) return jsonError(404, "not_found", "Journey not found.");

  try {
    // A second click while a roadmap is generating waits for the same Gemini call.
    const result = await singleFlight(`curriculum:${user.id}:${id}`, () => buildCurriculum(db, user.id, data));
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
