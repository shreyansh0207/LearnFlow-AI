"use client";

import { useActionState, useMemo, useState } from "react";
import { deleteAccount, updateGoals, updateNotifications, updatePreferences, updateProfile, type SettingsState } from "@/app/actions/account";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Hint, Input, Label, Select } from "@/components/ui";
import { clearDeviceLearningData } from "@/lib/saved-lessons";
import { useIsClient } from "@/lib/use-browser";
import { LEARNING_STYLES, STYLE_LABEL } from "@/lib/validation";

function Status({ state }: { state: SettingsState }) {
  if (state?.error) return <Alert kind="error">{state.error}</Alert>;
  if (state?.message) return <Alert kind="success">{state.message}</Alert>;
  return null;
}

function timeZones(current: string): string[] {
  try {
    const all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
    return all.includes(current) ? all : [current, ...all];
  } catch {
    return [current];
  }
}

export function ProfileForm({ displayName, timezone }: { displayName: string; timezone: string }) {
  const [state, action] = useActionState(updateProfile, null);
  const isClient = useIsClient();
  // The full timezone list and the device zone are only known in the browser.
  const zones = useMemo(() => (isClient ? timeZones(timezone) : [timezone]), [isClient, timezone]);
  const detected = isClient ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;

  return (
    <form action={action} className="space-y-4">
      <Status state={state} />
      <div>
        <Label htmlFor="displayName">Display name</Label>
        <Input id="displayName" name="displayName" defaultValue={displayName} maxLength={80} autoComplete="nickname" />
      </div>
      <div>
        <Label htmlFor="timezone">Timezone</Label>
        <Select id="timezone" name="timezone" defaultValue={timezone} key={zones.length}>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
        <Hint>
          Used to decide which day your learning counts for (streaks and reviews).
          {detected && detected !== timezone && ` This device is set to ${detected.replace(/_/g, " ")}.`}
        </Hint>
      </div>
      <SubmitButton pendingText="Saving…">Save profile</SubmitButton>
    </form>
  );
}

export function PreferencesForm({ styles, language, maxReviews }: { styles: string[]; language: string; maxReviews: number }) {
  const [state, action] = useActionState(updatePreferences, null);
  return (
    <form action={action} className="space-y-4">
      <Status state={state} />
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Preferred learning formats</legend>
        <div className="grid grid-cols-2 gap-2">
          {LEARNING_STYLES.map((s) => (
            <label key={s} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border px-3 text-sm">
              <input type="checkbox" name="styles" value={s} defaultChecked={styles.includes(s)} className="accent-primary" />
              {STYLE_LABEL[s]}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <Label htmlFor="language">Lesson explanations</Label>
        <Select id="language" name="language" defaultValue={language}>
          <option value="en">English</option>
          <option value="hinglish">Hinglish (Hindi + English)</option>
        </Select>
        <Hint>Applies to newly generated lessons. You can always tap “Explain in Hinglish” on any lesson.</Hint>
      </div>
      <div>
        <Label htmlFor="maxReviews">Maximum reviews per day</Label>
        <Input id="maxReviews" name="maxReviews" type="number" min={5} max={200} defaultValue={maxReviews} inputMode="numeric" />
        <Hint>Caps your daily queue so overdue cards never pile up into a wall.</Hint>
      </div>
      <SubmitButton pendingText="Saving…">Save preferences</SubmitButton>
    </form>
  );
}

export function GoalsForm({ minutes, activities, days }: { minutes: number; activities: number; days: number }) {
  const [state, action] = useActionState(updateGoals, null);
  return (
    <form action={action} className="space-y-4">
      <Status state={state} />
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="minutes">Minutes per day</Label>
          <Input id="minutes" name="minutes" type="number" min={5} max={240} defaultValue={minutes} inputMode="numeric" />
        </div>
        <div>
          <Label htmlFor="activities">Activities per day</Label>
          <Input id="activities" name="activities" type="number" min={1} max={20} defaultValue={activities} inputMode="numeric" />
        </div>
        <div>
          <Label htmlFor="days">Days per week</Label>
          <Input id="days" name="days" type="number" min={1} max={7} defaultValue={days} inputMode="numeric" />
        </div>
      </div>
      <Hint>An activity is a completed lesson, a submitted quiz, or 5 reviews.</Hint>
      <SubmitButton pendingText="Saving…">Save goals</SubmitButton>
    </form>
  );
}

export function NotificationsForm(props: { study: boolean; review: boolean; weekly: boolean; time: string }) {
  const [state, action] = useActionState(updateNotifications, null);
  const toggle = (name: string, label: string, hint: string, checked: boolean) => (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border p-4">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-1 size-5 accent-primary" />
    </label>
  );
  return (
    <form action={action} className="space-y-3">
      <Status state={state} />
      {toggle("studyReminders", "Daily study reminder", "A nudge at your chosen time on days you haven't studied yet.", props.study)}
      {toggle("reviewReminders", "Review reminders", "When cards are due for review.", props.review)}
      {toggle("weeklySummary", "Weekly summary", "A recap of what you learned this week.", props.weekly)}
      <div>
        <Label htmlFor="reminderTime">Reminder time (your timezone)</Label>
        <Input id="reminderTime" name="reminderTime" type="time" defaultValue={props.time.slice(0, 5)} className="w-40" />
      </div>
      <SubmitButton pendingText="Saving…">Save notification preferences</SubmitButton>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, action] = useActionState(deleteAccount, null);
  const [text, setText] = useState("");
  return (
    <form action={action} onSubmit={() => clearDeviceLearningData()} className="space-y-3">
      <Status state={state} />
      <div>
        <Label htmlFor="confirm">Type DELETE to confirm</Label>
        <Input id="confirm" name="confirm" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" className="max-w-56" />
      </div>
      <SubmitButton variant="danger" disabled={text !== "DELETE"} pendingText="Deleting…">
        Permanently delete my account
      </SubmitButton>
    </form>
  );
}
