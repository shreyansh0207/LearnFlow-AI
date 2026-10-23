import { Badge } from "@/components/ui";
import { STATUS_LABEL, type MasteryStatus } from "@/lib/learning/mastery";

const TONE: Record<MasteryStatus, "neutral" | "primary" | "accent" | "warn" | "danger" | "success"> = {
  not_started: "neutral",
  in_progress: "accent",
  needs_practice: "warn",
  developing: "primary",
  proficient: "success",
  mastered: "success",
};

export function MasteryBadge({ status, short = false }: { status: MasteryStatus; short?: boolean }) {
  if (status === "not_started" && short) return null;
  const label = short && status === "in_progress" ? "Studied" : STATUS_LABEL[status];
  return <Badge tone={TONE[status]}>{label}</Badge>;
}
