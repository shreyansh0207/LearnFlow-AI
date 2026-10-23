import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/auth-forms";
import { Alert, Card } from "@/components/ui";
import { safeNextPath } from "@/lib/utils";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Welcome back</h1>
      <p className="mt-1 text-sm text-muted">Sign in to continue your learning.</p>
      <div className="mt-5 space-y-3">
        {params.error === "link_invalid" && <Alert kind="error">That link is invalid or has expired. Please request a new one.</Alert>}
        {params.signedOut && <Alert kind="success">You&apos;ve been signed out.</Alert>}
        {params.deleted && <Alert kind="success">Your account and learning data have been deleted.</Alert>}
        {params.next && <Alert kind="info">Please sign in to continue.</Alert>}
        <LoginForm next={safeNextPath(params.next)} />
      </div>
      <p className="mt-6 text-center text-sm text-muted">
        New to LearnFlow?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </Card>
  );
}
