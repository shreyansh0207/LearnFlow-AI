import { AppShell } from "@/components/app-shell";
import { SetupRequired } from "@/components/setup-required";
import { requireUser } from "@/lib/auth";
import { readDatabaseEnv } from "@/lib/env";

// Private pages must always run the per-request session check — never prerender them.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const env = readDatabaseEnv();
  if (!env.ok) return <SetupRequired errors={env.errors} />;

  // Server-side session check on every private page; RLS still guards every query.
  const { user, profile } = await requireUser();
  const displayName = profile.display_name || user.email?.split("@")[0] || "Learner";

  return <AppShell displayName={displayName}>{children}</AppShell>;
}
