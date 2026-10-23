import type { Metadata } from "next";
import Link from "next/link";
import { InstallGuide } from "@/components/pwa/install";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Install the app" };

export default function InAppInstallPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/settings" className="text-sm text-muted hover:text-ink">← Settings</Link>
      <PageHeader title="Install LearnFlow" description="Add LearnFlow to your home screen from your browser — no app store needed." />
      <InstallGuide />
    </div>
  );
}
