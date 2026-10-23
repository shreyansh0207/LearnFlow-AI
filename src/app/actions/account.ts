"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { endSession } from "@/lib/auth/session";
import type { Db } from "@/lib/db";
import { isValidTimeZone } from "@/lib/learning/dates";
import { LEARNING_STYLES } from "@/lib/validation";

export type SettingsState = { error?: string; message?: string } | null;

const SAVED = { message: "Saved." };

async function run(db: Db, sql: string, params: unknown[]): Promise<boolean> {
  try {
    await db.query(sql, params);
    return true;
  } catch (e) {
    console.error("[learnflow] settings update failed:", (e as Error).message);
    return false;
  }
}

export async function updateProfile(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const parsed = z
    .object({
      displayName: z.string().trim().max(80),
      timezone: z.string().trim().refine(isValidTimeZone, { message: "Choose a valid timezone" }),
    })
    .safeParse({ displayName: formData.get("displayName") ?? "", timezone: formData.get("timezone") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { db, user } = await requireUser();
  if (!(await run(db, "update public.profiles set display_name = $1, timezone = $2 where id = $3", [parsed.data.displayName || null, parsed.data.timezone, user.id]))) {
    return { error: "Could not save your profile." };
  }
  revalidatePath("/", "layout");
  return SAVED;
}

export async function updatePreferences(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const parsed = z
    .object({
      styles: z.array(z.enum(LEARNING_STYLES)),
      language: z.enum(["en", "hinglish"]),
      maxReviews: z.coerce.number().int().min(5).max(200),
    })
    .safeParse({ styles: formData.getAll("styles"), language: formData.get("language"), maxReviews: formData.get("maxReviews") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { db, user } = await requireUser();
  const ok = await run(db, "update public.user_preferences set learning_styles = $1, explanation_language = $2, max_daily_reviews = $3 where user_id = $4", [
    parsed.data.styles,
    parsed.data.language,
    parsed.data.maxReviews,
    user.id,
  ]);
  if (!ok) return { error: "Could not save your preferences." };
  revalidatePath("/settings");
  return SAVED;
}

export async function updateGoals(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const parsed = z
    .object({
      minutes: z.coerce.number().int().min(5).max(240),
      activities: z.coerce.number().int().min(1).max(20),
      days: z.coerce.number().int().min(1).max(7),
    })
    .safeParse({ minutes: formData.get("minutes"), activities: formData.get("activities"), days: formData.get("days") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { db, user } = await requireUser();
  const ok = await run(db, "update public.daily_goals set minutes_target = $1, activities_target = $2, days_per_week = $3 where user_id = $4", [
    parsed.data.minutes,
    parsed.data.activities,
    parsed.data.days,
    user.id,
  ]);
  if (!ok) return { error: "Could not save your goals." };
  revalidatePath("/dashboard");
  return SAVED;
}

export async function updateNotifications(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const parsed = z
    .object({ reminderTime: z.string().regex(/^\d{2}:\d{2}$/, { message: "Choose a valid time" }) })
    .safeParse({ reminderTime: formData.get("reminderTime") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { db, user } = await requireUser();
  const ok = await run(db, "update public.notification_preferences set study_reminders = $1, review_reminders = $2, weekly_summary = $3, reminder_time = $4 where user_id = $5", [
    formData.get("studyReminders") === "on",
    formData.get("reviewReminders") === "on",
    formData.get("weeklySummary") === "on",
    parsed.data.reminderTime,
    user.id,
  ]);
  if (!ok) return { error: "Could not save your notification preferences." };
  revalidatePath("/settings/notifications");
  return SAVED;
}

/** Permanently deletes the account and (via cascades) every learning record. */
export async function deleteAccount(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  if (formData.get("confirm") !== "DELETE") return { error: "Type DELETE to confirm." };
  const { db } = await requireUser();
  try {
    // Deleting the auth user cascades to every user-owned row (and the session itself).
    await db.query("select public.delete_my_account()");
  } catch (e) {
    console.error("[learnflow] account deletion failed:", (e as Error).message);
    return { error: "Your account couldn't be deleted. Please try again or contact support." };
  }
  await endSession().catch(() => {});
  redirect("/login?deleted=1");
}
