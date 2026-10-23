import type { Metadata } from "next";
import { InstallGuide } from "@/components/pwa/install";

export const metadata: Metadata = { title: "Install the app" };

export default function InstallPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Install LearnFlow</h1>
      <p className="mt-2 text-muted">
        LearnFlow is a Progressive Web App: install it from your browser in seconds, with no app store. You always approve the installation yourself.
      </p>
      <div className="mt-8">
        <InstallGuide />
      </div>
    </div>
  );
}
