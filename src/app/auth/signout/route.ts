import { NextResponse, type NextRequest } from "next/server";
import { endSession } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  try {
    await endSession();
  } catch {
    // Even if the database is unreachable, clear the cookie path by redirecting to login.
  }
  return NextResponse.redirect(new URL("/login?signedOut=1", request.nextUrl.origin), { status: 303 });
}
