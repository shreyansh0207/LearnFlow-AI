import { NextResponse } from "next/server";
import { generateDiagnostic } from "@/lib/ai/generate";
import { handleRouteError } from "@/lib/api";
import { jsonError, requireApiUser } from "@/lib/auth";
import { getJourneyOutline } from "@/lib/data";
import { saveAssessment } from "@/lib/learning/assessments";
import { isUuid } from "@/lib/utils";

export const maxDuration = 120;

/** One question per early topic, used only to recommend a starting point. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) return auth;
  const { db, user } = auth;
  const { id } = await params;
  if (!isUuid(id)) return jsonError(404, "not_found", "Journey not found.");

  const outline = await getJourneyOutline(db, id);
  if (!outline || outline.flatTopics.length === 0) return jsonError(404, "not_found", "This journey has no roadmap yet.");
  const topics = outline.flatTopics.filter((t) => !t.title.toLowerCase().includes("checkpoint")).slice(0, 6).map((t) => t.title);

  try {
    const generated = await generateDiagnostic({ db, userId: user.id }, { subject: outline.journey.subject, currentLevel: outline.journey.current_level, topics });
    const assessmentId = await saveAssessment(db, {
      userId: user.id,
      journeyId: id,
      topicId: null,
      kind: "diagnostic",
      difficulty: "standard",
      quiz: generated.data,
      source: generated.source,
      model: generated.model,
    });
    return NextResponse.json({ assessmentId });
  } catch (err) {
    return handleRouteError(err);
  }
}
