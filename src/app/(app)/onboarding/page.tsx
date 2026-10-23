import type { Metadata } from "next";
import { JourneyForm } from "@/components/journey-form";
import { AIStatusNotice } from "@/components/ai-status";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Welcome" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const { profile } = await requireUser("/onboarding");
  const { subject } = await searchParams;
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">
        {profile.display_name ? `Welcome, ${profile.display_name}!` : "Welcome to LearnFlow!"}
      </h1>
      <p className="mt-1 text-sm text-muted">
        A few quick questions and we&apos;ll design a learning journey just for you. Optional questions can be skipped.
      </p>
      <AIStatusNotice className="mt-4" />
      <div className="mt-6">
        <JourneyForm onboarding initialSubject={subject?.slice(0, 160)} />
      </div>
    </div>
  );
}
