"use client";

import Link from "next/link";
import { useState } from "react";
import { CircleCheck, Download, EllipsisVertical, Share, SquarePlus, Smartphone } from "lucide-react";
import { Alert, Badge, Button, Card, CardTitle } from "@/components/ui";
import { cn } from "@/lib/utils";
import { usePwa } from "./pwa-provider";

/** Compact install control for headers and the dashboard. Renders nothing once installed. */
export function InstallButton({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { ready, isStandalone, installedThisSession, canPrompt, promptInstall } = usePwa();
  if (!ready || isStandalone) return null;
  if (installedThisSession) {
    return (
      <Badge tone="success" className={className}>
        <CircleCheck aria-hidden className="size-3.5" /> Installed
      </Badge>
    );
  }
  if (canPrompt) {
    return (
      <Button size="sm" variant="soft" className={className} onClick={() => void promptInstall()}>
        <Download aria-hidden className="size-4" /> {compact ? "Install" : "Install app"}
      </Button>
    );
  }
  return (
    <Link href="/install" className={cn("inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-primary hover:bg-primary-soft", className)}>
      <Smartphone aria-hidden className="size-4" /> {compact ? "Get app" : "Install app"}
    </Link>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">{n}</span>
      <span className="pt-0.5 text-sm leading-relaxed">{children}</span>
    </li>
  );
}

/** Full, platform-aware install guide. Honest about what each platform supports. */
export function InstallGuide() {
  const { ready, platform, isStandalone, installedThisSession, canPrompt, promptInstall, swSupported } = usePwa();
  const [result, setResult] = useState<string | null>(null);
  const [tab, setTab] = useState<"android" | "ios" | "desktop" | null>(null);
  const active = tab ?? platform;

  return (
    <div className="space-y-5">
      <Card>
        <CardTitle>Installation status</CardTitle>
        <div className="mt-3 text-sm">
          {!ready ? (
            <p className="text-muted">Checking this device…</p>
          ) : isStandalone ? (
            <Alert kind="success" title="You're using the installed app">LearnFlow is running from your home screen.</Alert>
          ) : installedThisSession ? (
            <Alert kind="success" title="Installed">Open LearnFlow from your home screen or app list.</Alert>
          ) : canPrompt ? (
            <div className="space-y-3">
              <p className="text-muted">Your browser supports one-tap installation.</p>
              <Button
                onClick={async () => {
                  const outcome = await promptInstall();
                  setResult(outcome === "accepted" ? "Installing… LearnFlow will appear on your home screen." : outcome === "dismissed" ? "Installation cancelled. You can install any time." : "Installation isn't available right now.");
                }}
              >
                <Download aria-hidden className="size-4" /> Install LearnFlow
              </Button>
              {result && <p className="text-muted">{result}</p>}
            </div>
          ) : (
            <p className="text-muted">
              {platform === "ios"
                ? "On iPhone and iPad, installation is done from the Share menu — follow the steps below."
                : "Your browser hasn't offered one-tap installation on this visit. Use the manual steps below for your device."}
            </p>
          )}
          {ready && !swSupported && (
            <Alert kind="warn" className="mt-3" title="Limited browser support">
              This browser doesn&apos;t support service workers, so offline features won&apos;t work here. Try an up-to-date Chrome, Edge, Samsung Internet or Safari.
            </Alert>
          )}
        </div>
      </Card>

      <div role="tablist" aria-label="Device type" className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
        {(["android", "ios", "desktop"] as const).map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={active === p}
            onClick={() => setTab(p)}
            className={cn("h-10 rounded-lg text-sm font-medium", active === p ? "bg-surface text-ink shadow-sm" : "text-muted")}
          >
            {p === "android" ? "Android" : p === "ios" ? "iPhone / iPad" : "Desktop"}
          </button>
        ))}
      </div>

      {active === "android" && (
        <Card>
          <CardTitle>Install on Android</CardTitle>
          <p className="mt-1 text-sm text-muted">Works in Chrome, Edge and Samsung Internet. No Play Store needed.</p>
          <ol className="mt-4 space-y-3">
            <Step n={1}>Open LearnFlow in Chrome (or Edge / Samsung Internet).</Step>
            <Step n={2}>
              If you see an <strong>Install app</strong> button in LearnFlow, tap it and confirm. Otherwise, tap the browser menu{" "}
              <EllipsisVertical aria-label="three dots" className="inline size-4" />.
            </Step>
            <Step n={3}>
              Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>, then <strong>Install</strong>.
            </Step>
            <Step n={4}>Open LearnFlow from your home screen or app drawer. It launches full-screen, like an app.</Step>
          </ol>
        </Card>
      )}

      {active === "ios" && (
        <Card>
          <CardTitle>Install on iPhone or iPad</CardTitle>
          <p className="mt-1 text-sm text-muted">
            iOS doesn&apos;t show install pop-ups, so this is always a manual step. No App Store needed.
          </p>
          <ol className="mt-4 space-y-3">
            <Step n={1}>
              Open LearnFlow in <strong>Safari</strong>. (On iOS 16.4 or later you can also use Chrome or Edge.)
            </Step>
            <Step n={2}>
              Tap the <strong>Share</strong> button <Share aria-label="share icon" className="inline size-4" /> — at the bottom of the screen in Safari on iPhone, or at the top on iPad.
            </Step>
            <Step n={3}>
              Scroll down and tap <strong>Add to Home Screen</strong> <SquarePlus aria-label="add icon" className="inline size-4" />. If you don&apos;t see it, tap <strong>Edit Actions</strong> and add it.
            </Step>
            <Step n={4}>
              Make sure <strong>Open as Web App</strong> is on (if shown), then tap <strong>Add</strong>.
            </Step>
            <Step n={5}>Launch LearnFlow from your home screen. It opens without the browser bars.</Step>
          </ol>
          <p className="mt-4 text-xs text-muted">
            Note: the installed app keeps its own sign-in, so you may need to sign in once after installing.
          </p>
        </Card>
      )}

      {active === "desktop" && (
        <Card>
          <CardTitle>Install on a computer</CardTitle>
          <ol className="mt-4 space-y-3">
            <Step n={1}>Open LearnFlow in Chrome or Edge.</Step>
            <Step n={2}>Click the install icon at the right end of the address bar, or open the browser menu and choose <strong>Install LearnFlow AI</strong>.</Step>
            <Step n={3}>LearnFlow opens in its own window and appears in your apps list.</Step>
          </ol>
          <p className="mt-4 text-xs text-muted">Safari on macOS Sonoma or later: File → Add to Dock. Firefox desktop doesn&apos;t support installing web apps; use it in a tab.</p>
        </Card>
      )}

      <Card>
        <CardTitle>What works offline</CardTitle>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted">
          <li>The app opens and shows an offline screen instead of an error.</li>
          <li>Lessons you tap “Save for offline” on can be read without a connection.</li>
          <li>If your connection drops mid-lesson or mid-review, completions and ratings are queued on this device and synced automatically.</li>
          <li>AI lessons, quizzes, the tutor and your dashboard need a connection.</li>
        </ul>
      </Card>
    </div>
  );
}
