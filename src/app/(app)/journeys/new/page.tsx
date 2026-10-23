import type { Metadata } from "next";
import { JourneyForm } from "@/components/journey-form";
import { AIStatusNotice } from "@/components/ai-status";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { asPattern } from "@/lib/curriculum/build";
import { isUuid } from "@/lib/utils";

export const metadata: Metadata = { title: "New learning journey" };

export default async function NewJourneyPage({ searchParams }: { searchParams: Promise<{ subject?: string; goal?: string; pattern?: string; node?: string }> }) {
  const sp = await searchParams;
  const { db } = await requireUser("/journeys/new");
  let node: { id: string; name: string; learning_pattern: string | null } | null = null;
  if (sp.node && isUuid(sp.node)) {
    node = await db.maybeOne<{ id: string; name: string; learning_pattern: string | null }>("select id, name, learning_pattern from public.knowledge_nodes where id = $1", [sp.node]);
  }
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Create a learning journey" description="Any subject — from absolute zero to your target level." />
      <AIStatusNotice className="mb-5" />
      <JourneyForm
        onboarding={false}
        initialSubject={(sp.subject ?? node?.name)?.slice(0, 160)}
        initialGoal={sp.goal?.slice(0, 1000)}
        initialPattern={asPattern(sp.pattern) ?? asPattern(node?.learning_pattern)}
        knowledgeNodeId={node?.id ?? null}
        topicName={node?.name ?? null}
      />
    </div>
  );
}
