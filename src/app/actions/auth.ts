"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DUMMY_HASH, hashPassword, hashToken, newToken, verifyPassword } from "@/lib/auth/password";
import { allowAttempt, currentUser, endSession, startSession } from "@/lib/auth/session";
import { databaseConfigured, pgCode, serviceDb } from "@/lib/db";
import { safeNextPath } from "@/lib/utils";

/**
 * redirectTo: after a session cookie is set, the browser performs a full navigation
 * so the next request carries the new cookie (a server-side redirect in the same
 * response would render the target before the cookie exists).
 */
export type FormState = {
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
  redirectTo?: string;
  /** Non-secret values echoed back so a failed attempt doesn't clear the form (never the password). */
  values?: { email?: string; displayName?: string };
} | null;

const email = z.email({ message: "Enter a valid email address" }).max(254).transform((e) => e.trim().toLowerCase());
const password = z
  .string()
  .min(8, { message: "Use at least 8 characters" })
  .max(200, { message: "Use at most 200 characters" });

const NOT_CONFIGURED = "Accounts aren't available yet: the server is missing its database configuration (DATABASE_URL).";

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0] ?? "form")] ??= issue.message;
  return out;
}

/**
 * After a session cookie is set: JavaScript submissions get a redirect target and
 * do a full navigation client-side; native (no-JS / pre-hydration) form posts get
 * a real HTTP redirect. Either way the next request carries the new cookie.
 */
async function finish(path: string): Promise<FormState> {
  const isJsSubmission = Boolean((await headers()).get("next-action"));
  if (!isJsSubmission) redirect(path);
  return { redirectTo: path };
}

async function clientInfo() {
  const h = await headers();
  return {
    ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local",
    userAgent: h.get("user-agent"),
  };
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { email: String(formData.get("email") ?? "").slice(0, 254), displayName: String(formData.get("displayName") ?? "").slice(0, 80) };
  const result = await signUpInner(formData);
  return result?.redirectTo ? result : { ...result, values };
}

async function signUpInner(formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ email, password, displayName: z.string().trim().max(80).optional() })
    .safeParse({ email: formData.get("email"), password: formData.get("password"), displayName: formData.get("displayName") || undefined });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  if (!databaseConfigured()) return { error: NOT_CONFIGURED };

  const { ip, userAgent } = await clientInfo();
  if (!(await allowAttempt(`signup:${ip}`, 10, 60))) return { error: "Too many sign-ups from this network. Please try again later." };

  let userId: string;
  try {
    const row = await serviceDb().one<{ id: string }>(
      "insert into auth.users (email, password_hash, raw_user_meta_data) values ($1, $2, $3) returning id",
      [parsed.data.email, await hashPassword(parsed.data.password), parsed.data.displayName ? { display_name: parsed.data.displayName } : {}],
    );
    userId = row.id;
  } catch (e) {
    if (pgCode(e) === "23505") return { fieldErrors: { email: "An account with this email already exists. Try signing in." } };
    console.error("[learnflow] sign-up failed:", (e as Error).message);
    return { error: "We couldn't create your account. Please try again." };
  }
  await startSession(userId, userAgent);
  return finish("/onboarding");
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { email: String(formData.get("email") ?? "").slice(0, 254) };
  const result = await signInInner(formData);
  return result?.redirectTo ? result : { ...result, values };
}

async function signInInner(formData: FormData): Promise<FormState> {
  const parsed = z.object({ email, password: z.string().min(1, { message: "Enter your password" }).max(200) }).safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  if (!databaseConfigured()) return { error: NOT_CONFIGURED };

  const { ip, userAgent } = await clientInfo();
  const okIp = await allowAttempt(`signin-ip:${ip}`, 30, 15);
  const okAccount = await allowAttempt(`signin:${parsed.data.email}`, 8, 15);
  if (!okIp || !okAccount) return { error: "Too many sign-in attempts. Please wait 15 minutes and try again." };

  const user = await serviceDb().maybeOne<{ id: string; password_hash: string }>("select id, password_hash from auth.users where email = $1", [parsed.data.email]);
  // Always run a hash comparison so response time doesn't reveal whether the email exists.
  const valid = await verifyPassword(parsed.data.password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !valid) return { error: "Incorrect email or password." };

  await startSession(user.id, userAgent);
  return finish(safeNextPath(String(formData.get("next") ?? "")));
}

export async function signOut() {
  await endSession();
  redirect("/login?signedOut=1");
}

/**
 * Starts a password reset. LearnFlow has no email service configured, so the
 * link is printed to the server console in development; in production we say
 * honestly that email reset isn't available instead of pretending to send mail.
 */
export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = email.safeParse(formData.get("email"));
  if (!parsed.success) return { fieldErrors: { email: parsed.error.issues[0].message } };
  if (!databaseConfigured()) return { error: NOT_CONFIGURED };

  const isDev = process.env.NODE_ENV !== "production";
  if (!isDev) {
    return { error: "Password reset by email isn't available on this server yet (no email service is configured). Please contact the site administrator." };
  }
  const { ip } = await clientInfo();
  if (!(await allowAttempt(`reset:${ip}`, 10, 60))) return { error: "Too many reset requests. Please try again later." };

  const user = await serviceDb().maybeOne<{ id: string }>("select id from auth.users where email = $1", [parsed.data]);
  if (user) {
    const token = newToken();
    await serviceDb().query("insert into auth.password_resets (token_hash, user_id, expires_at) values ($1, $2, now() + interval '30 minutes')", [hashToken(token), user.id]);
    const site = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
    console.info(`[learnflow] DEV ONLY password reset link for ${parsed.data}: ${site}/reset-password?token=${token}`);
  }
  return { message: "Development mode: if that account exists, a reset link has been printed in the server console (valid for 30 minutes)." };
}

/** Completes a reset using the one-time token, signs out every other session, and signs in. */
export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ token: z.string().min(20).max(200), password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "Passwords don't match", path: ["confirm"] })
    .safeParse({ token: formData.get("token"), password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const row = await serviceDb().maybeOne<{ user_id: string }>(
    "update auth.password_resets set used_at = now() where token_hash = $1 and used_at is null and expires_at > now() returning user_id",
    [hashToken(parsed.data.token)],
  );
  if (!row) return { error: "This reset link is invalid or has expired. Request a new one." };
  await serviceDb().tx(async (db) => {
    await db.query("update auth.users set password_hash = $1 where id = $2", [await hashPassword(parsed.data.password), row.user_id]);
    await db.query("delete from auth.sessions where user_id = $1", [row.user_id]);
  });
  const { userAgent } = await clientInfo();
  await startSession(row.user_id, userAgent);
  return finish("/dashboard?passwordUpdated=1");
}

/** Change password while signed in (requires the current password). Other sessions are signed out. */
export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ current: z.string().min(1, { message: "Enter your current password" }), password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "Passwords don't match", path: ["confirm"] })
    .safeParse({ current: formData.get("current"), password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const user = await currentUser();
  if (!user) return { error: "Your session has expired. Please sign in again." };
  if (!(await allowAttempt(`change:${user.id}`, 8, 15))) return { error: "Too many attempts. Please wait 15 minutes." };

  const stored = await serviceDb().one<{ password_hash: string }>("select password_hash from auth.users where id = $1", [user.id]);
  if (!(await verifyPassword(parsed.data.current, stored.password_hash))) return { fieldErrors: { current: "That isn't your current password." } };
  await serviceDb().tx(async (db) => {
    await db.query("update auth.users set password_hash = $1 where id = $2", [await hashPassword(parsed.data.password), user.id]);
    await db.query("delete from auth.sessions where user_id = $1", [user.id]);
  });
  const { userAgent } = await clientInfo();
  await startSession(user.id, userAgent);
  return { message: "Password updated. Other devices have been signed out." };
}
