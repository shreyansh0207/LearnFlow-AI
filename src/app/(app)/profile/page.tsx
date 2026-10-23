import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Flame, GraduationCap, ListChecks, ShieldCheck, Smartphone, Trophy } from "lucide-react";
import { MORE_LINKS } from "@/components/app-shell";
import { SignOutButton } from "@/components/auth-forms";
import { Card, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { loadActivity } from "@/lib/dashboard";
import { localDate } from "@/lib/learning/dates";
import { computeStreaks, isMeaningfulDay } from "@/lib/learning/streaks";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const { db, user, profile } = await requireUser("/profile");
  const [activity, lessons, quizzes, admin] = await Promise.all([
    loadActivity(db),
    db.count("select count(*)::int as count from public.lesson_sessions where completed_at is not null"),
    db.count("select count(*)::int as count from public.assessment_attempts"),
    db.maybeOne("select user_id from public.app_admins where user_id = $1", [user.id]),
  ]);
  const streak = computeStreaks(activity.filter(isMeaningfulDay).map((r) => r.local_date), localDate(new Date(), profile.timezone));
  const name = profile.display_name || user.email?.split("@")[0] || "Learner";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <span className="brand-gradient flex size-16 items-center justify-center rounded-2xl text-2xl font-semibold text-white">{name.slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{name}</h1>
          <p className="truncate text-sm text-muted">{user.email}</p>
          <p className="text-xs text-muted">Learning since {new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Current streak" icon={<Flame aria-hidden className="size-3.5 text-warn" />} value={`${streak.current} d`} />
        <Stat label="Longest streak" icon={<Trophy aria-hidden className="size-3.5 text-accent" />} value={`${streak.longest} d`} />
        <Stat label="Lessons completed" icon={<GraduationCap aria-hidden className="size-3.5 text-primary" />} value={lessons ?? 0} />
        <Stat label="Quizzes taken" icon={<ListChecks aria-hidden className="size-3.5 text-primary" />} value={quizzes ?? 0} />
      </div>

      <Card className="p-0">
        <nav aria-label="More">
          <ul className="divide-y divide-border">
            {[...MORE_LINKS, { href: "/settings/install", label: "Install the app", icon: Smartphone }, ...(admin ? [{ href: "/admin/catalog", label: "Catalog admin", icon: ShieldCheck }] : [])].map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link href={href} className="flex min-h-13 items-center gap-3 px-4 py-3.5 text-sm hover:bg-surface-2">
                  <Icon aria-hidden className="size-[18px] text-muted" />
                  <span className="flex-1 font-medium">{label}</span>
                  <ChevronRight aria-hidden className="size-4 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Card>

      <SignOutButton className="w-full" />
    </div>
  );
}
