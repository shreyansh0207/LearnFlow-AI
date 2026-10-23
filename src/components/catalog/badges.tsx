import {
  Atom,
  Banknote,
  BookOpen,
  Brain,
  Briefcase,
  Building,
  Cpu,
  GraduationCap,
  Hammer,
  HeartPulse,
  Landmark,
  Languages,
  Palette,
  Scale,
  Sigma,
  Sparkles,
  Sun,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui";

const ICONS: Record<string, LucideIcon> = {
  atom: Atom,
  sigma: Sigma,
  cpu: Cpu,
  "heart-pulse": HeartPulse,
  banknote: Banknote,
  building: Building,
  brain: Brain,
  landmark: Landmark,
  languages: Languages,
  palette: Palette,
  briefcase: Briefcase,
  hammer: Hammer,
  trophy: Trophy,
  scale: Scale,
  "graduation-cap": GraduationCap,
  sun: Sun,
  sparkles: Sparkles,
};

/** Icon names come from catalog data; unknown names fall back to a book. */
export function DomainIcon({ name, className }: { name: string | null; className?: string }) {
  const Icon = (name && ICONS[name]) || BookOpen;
  return <Icon aria-hidden className={className} />;
}

const ORIGIN_LABEL: Record<string, string> = {
  curated: "Curated",
  imported: "Imported",
  ai_generated: "AI-generated",
  user_suggested: "Suggested by a learner",
};

/** Makes provenance visible: curated, imported, AI-generated and learner-suggested content are never presented as the same thing. */
export function ProvenanceBadge({ origin, status }: { origin: string; status: string }) {
  if (status === "verified") return <Badge tone="success">{origin === "curated" ? "Curated" : `${ORIGIN_LABEL[origin] ?? origin} · verified`}</Badge>;
  if (status === "reviewed") return <Badge tone="accent">{ORIGIN_LABEL[origin] ?? origin} · reviewed</Badge>;
  if (status === "rejected") return <Badge tone="danger">Rejected</Badge>;
  if (status === "merged") return <Badge>Merged</Badge>;
  return <Badge tone="warn">{ORIGIN_LABEL[origin] ?? origin} · unreviewed</Badge>;
}

export const PROVENANCE_HELP: Record<string, string> = {
  verified: "Curated or checked by the LearnFlow team.",
  reviewed: "Reviewed for structure; details may still need checking.",
  proposed: "An automatically generated or learner-suggested proposal that hasn't been reviewed yet. Use it as a starting point and verify important facts.",
};
