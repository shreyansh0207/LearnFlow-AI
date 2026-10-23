import type { Metadata } from "next";
import Link from "next/link";
import { Bell, ChevronRight, Smartphone, Sparkles } from "lucide-react";
import { ChangePasswordForm, SignOutButton } from "@/components/auth-forms";
import { DeleteAccountForm, GoalsForm, PreferencesForm, ProfileForm } from "@/components/settings-forms";
import { Card, CardTitle, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { db, user, profile } = await requireUser("/settings");
  const [prefs, goals] = await Promise.all([
    db.maybeOne<{ learning_styles: string[]; explanation_language: string; max_daily_reviews: number }>(
      "select learning_styles, explanation_language, max_daily_reviews from public.user_preferences where user_id = $1",
      [user.id],
    ),
    db.maybeOne<{ minutes_target: number; activities_target: number; days_per_week: number }>("select minutes_target, activities_target, days_per_week from public.daily_goals where user_id = $1", [user.id]),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title="Settings" />

      <Card>
        <CardTitle>Profile</CardTitle>
        <p className="mb-4 mt-1 text-xs text-muted">Signed in as {user.email}</p>
        <ProfileForm displayName={profile.display_name ?? ""} timezone={profile.timezone} />
      </Card>

      <Card>
        <CardTitle className="mb-4">Daily goals</CardTitle>
        <GoalsForm minutes={goals?.minutes_target ?? 20} activities={goals?.activities_target ?? 2} days={goals?.days_per_week ?? 5} />
      </Card>

      <Card>
        <CardTitle className="mb-4">Learning preferences</CardTitle>
        <PreferencesForm styles={prefs?.learning_styles ?? []} language={prefs?.explanation_language ?? "en"} maxReviews={prefs?.max_daily_reviews ?? 20} />
      </Card>

      <Card className="p-0">
        <Link href="/settings/notifications" className="flex items-center gap-3 px-5 py-4 text-sm hover:bg-surface-2">
          <Bell aria-hidden className="size-[18px] text-muted" />
          <span className="flex-1 font-medium">Notification preferences</span>
          <ChevronRight aria-hidden className="size-4 text-muted" />
        </Link>
        <Link href="/settings/install" className="flex items-center gap-3 border-t border-border px-5 py-4 text-sm hover:bg-surface-2">
          <Smartphone aria-hidden className="size-[18px] text-muted" />
          <span className="flex-1 font-medium">Install the app</span>
          <ChevronRight aria-hidden className="size-4 text-muted" />
        </Link>
        <Link href="/settings/ai" className="flex items-center gap-3 border-t border-border px-5 py-4 text-sm hover:bg-surface-2">
          <Sparkles aria-hidden className="size-[18px] text-muted" />
          <span className="flex-1 font-medium">AI status & Gemini self-test</span>
          <ChevronRight aria-hidden className="size-4 text-muted" />
        </Link>
      </Card>

      <Card>
        <CardTitle className="mb-4">Password</CardTitle>
        <ChangePasswordForm />
      </Card>

      <Card>
        <CardTitle>Session</CardTitle>
        <p className="mb-3 mt-1 text-sm text-muted">Signing out also removes lessons saved for offline on this device.</p>
        <SignOutButton />
      </Card>

      <Card className="border-danger/30">
        <CardTitle className="text-danger">Delete account</CardTitle>
        <p className="mb-4 mt-1 text-sm text-muted">
          This permanently deletes your account and all learning data — journeys, lessons, quiz history, reviews, notes and tutor conversations. It cannot be undone.
        </p>
        <DeleteAccountForm />
      </Card>
    </div>
  );
}
