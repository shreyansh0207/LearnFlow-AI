import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth-forms";
import { Alert, Card } from "@/components/ui";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const valid = typeof token === "string" && token.length >= 20 && token.length <= 200;
  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Choose a new password</h1>
      <div className="mt-5">
        {valid ? (
          <ResetPasswordForm token={token} />
        ) : (
          <Alert kind="warn" title="Reset link required">
            Open the full reset link you were given, or <Link href="/forgot-password">request a new one</Link>.
          </Alert>
        )}
      </div>
    </Card>
  );
}
