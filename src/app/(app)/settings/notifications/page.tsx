import type { Metadata } from "next";
import Link from "next/link";
import { NotificationsForm } from "@/components/settings-forms";
import { Alert, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const { db, user } = await requireUser("/settings/notifications");
  const data = await db.maybeOne<{ study_reminders: boolean; review_reminders: boolean; weekly_summary: boolean; reminder_time: string }>(
    "select study_reminders, review_reminders, weekly_summary, reminder_time from public.notification_preferences where user_id = $1",
    [user.id],
  );

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/settings" className="text-sm text-muted hover:text-ink">← Settings</Link>
      <PageHeader title="Notification preferences" />
      <Alert kind="info" className="mb-4" title="Your choices are saved to your account">
        Reminder delivery (email or push) needs a sending service to be connected by the site operator. Until then these preferences are stored but no reminders are sent.
      </Alert>
      <Card>
        <NotificationsForm study={data?.study_reminders ?? false} review={data?.review_reminders ?? false} weekly={data?.weekly_summary ?? false} time={data?.reminder_time ?? "19:00"} />
      </Card>
    </div>
  );
}
