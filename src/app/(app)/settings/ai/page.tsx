import type { Metadata } from "next";
import Link from "next/link";
import { AiSelfTest, AiStatusCard } from "@/components/ai-tools";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "AI status" };

export default function AiStatusPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/settings" className="text-sm text-muted hover:text-ink">← Settings</Link>
      <PageHeader title="AI status" description="LearnFlow's lessons, quizzes, tutor and roadmaps are generated on the server by open models running on Groq." />
      <AiStatusCard />
      <AiSelfTest />
    </div>
  );
}
