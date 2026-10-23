import "server-only";
import { cookies } from "next/headers";
import { serviceDb } from "@/lib/db";
import { hashToken, newToken } from "./password";

export { SESSION_COOKIE } from "./cookie";
import { SESSION_COOKIE } from "./cookie";
const SESSION_DAYS = 30;
const REFRESH_AFTER_MS = 24 * 3600_000;

export type AuthUser = { id: string; email: string; created_at: string };

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

/** Creates a session row and sets the cookie. Call only from a route handler or server action. */
export async function startSession(userId: string, userAgent: string | null): Promise<void> {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await serviceDb().query("insert into auth.sessions (id, user_id, expires_at, user_agent) values ($1, $2, $3, $4)", [hashToken(token), userId, expires.toISOString(), userAgent?.slice(0, 300) ?? null]);
  await serviceDb().query("update auth.users set last_sign_in_at = now() where id = $1", [userId]);
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(expires));
}

/** Validates the session cookie. Returns null when missing, unknown or expired. */
export async function currentUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 200) return null;
  const id = hashToken(token);
  const row = await serviceDb().maybeOne<AuthUser & { last_seen_at: string }>(
    `select u.id, u.email, u.created_at, s.last_seen_at
       from auth.sessions s join auth.users u on u.id = s.user_id
      where s.id = $1 and s.expires_at > now()`,
    [id],
  );
  if (!row) return null;
  // Sliding expiry, at most once a day per session.
  if (Date.now() - new Date(row.last_seen_at).getTime() > REFRESH_AFTER_MS) {
    await serviceDb().query("update auth.sessions set last_seen_at = now(), expires_at = now() + interval '30 days' where id = $1", [id]);
  }
  return { id: row.id, email: row.email, created_at: row.created_at };
}

/** Deletes the current session and clears the cookie. */
export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await serviceDb().query("delete from auth.sessions where id = $1", [hashToken(token)]).catch(() => {});
  jar.delete(SESSION_COOKIE);
}

/**
 * Sliding-window limiter for authentication attempts.
 * Returns true when the caller is allowed to proceed.
 */
export async function allowAttempt(key: string, max: number, windowMinutes: number): Promise<boolean> {
  const db = serviceDb();
  const recent = await db.count("select count(*)::int as count from auth.attempts where key = $1 and created_at > now() - make_interval(mins => $2)", [key, windowMinutes]);
  if (recent >= max) return false;
  await db.query("insert into auth.attempts (key) values ($1)", [key]);
  // Opportunistic cleanup so the table stays small.
  if (Math.random() < 0.02) await db.query("delete from auth.attempts where created_at < now() - interval '1 day'");
  return true;
}
