import "server-only";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseConfigured, userDb, type Db } from "@/lib/db";
import { safeTimeZone } from "@/lib/learning/dates";
import { currentUser, type AuthUser } from "./session";

export type { AuthUser } from "./session";

export type Profile = {
  id: string;
  display_name: string | null;
  timezone: string;
  onboarded_at: string | null;
};

/** `db` runs every query as this user under Row Level Security. */
export type AuthContext = { db: Db; user: AuthUser; profile: Profile };

async function loadProfile(db: Db, user: AuthUser): Promise<Profile> {
  const row = await db.maybeOne<Profile>("select id, display_name, timezone, onboarded_at from public.profiles where id = $1", [user.id]);
  if (row) return { ...row, timezone: safeTimeZone(row.timezone) };
  // The signup trigger normally creates this row; recover if it is missing.
  await db.query("insert into public.profiles (id) values ($1) on conflict (id) do nothing", [user.id]);
  return { id: user.id, display_name: null, timezone: "UTC", onboarded_at: null };
}

/** For server components and actions: redirects to login if there is no valid session. */
export async function requireUser(nextPath?: string): Promise<AuthContext> {
  if (!databaseConfigured()) throw new DatabaseNotConfiguredError();
  const user = await currentUser();
  if (!user) redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  const db = userDb(user.id);
  return { db, user, profile: await loadProfile(db, user) };
}

export async function getOptionalUser(): Promise<AuthUser | null> {
  if (!databaseConfigured()) return null;
  try {
    return await currentUser();
  } catch {
    return null;
  }
}

export function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** For route handlers: returns an auth context or a JSON error response. */
export async function requireApiUser(): Promise<AuthContext | NextResponse> {
  if (!databaseConfigured()) return jsonError(503, "not_configured", "The server is missing its database configuration (DATABASE_URL).");
  let user: AuthUser | null;
  try {
    user = await currentUser();
  } catch {
    return jsonError(503, "database_unavailable", "The database is unreachable right now. Please try again shortly.");
  }
  if (!user) return jsonError(401, "unauthenticated", "Your session has expired. Please sign in again.");
  const db = userDb(user.id);
  return { db, user, profile: await loadProfile(db, user) };
}
