import { Alert } from "@/components/ui";
import { readAIConfig } from "@/lib/env";

/** Server component: tells the learner honestly whether AI generation is live, demo-only, or unavailable. */
export function AIStatusNotice({ className }: { className?: string }) {
  const config = readAIConfig();
  if (config.mode === "live") return null;
  if (config.mode === "demo") {
    return (
      <Alert kind="warn" className={className} title="Demo mode">
        No AI provider is configured, so curricula, lessons and quizzes use clearly labelled template content for testing. Progress, reviews and streaks still work normally.
      </Alert>
    );
  }
  return (
    <Alert kind="warn" className={className} title="AI generation unavailable">
      {config.reason}
    </Alert>
  );
}
