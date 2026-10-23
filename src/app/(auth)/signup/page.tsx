import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "@/components/auth-forms";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Create your account" };

export default function SignupPage() {
  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Start learning from zero</h1>
      <p className="mt-1 text-sm text-muted">Create a free account to build your personalised learning journey.</p>
      <div className="mt-5">
        <SignupForm />
      </div>
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
