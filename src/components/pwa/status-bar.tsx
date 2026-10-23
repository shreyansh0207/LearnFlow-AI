"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import { usePwa } from "./pwa-provider";

/** Connection, sync and app-update notices shown at the top of every page. */
export function PwaStatusBar() {
  const { online, pendingSync, updateAvailable, applyUpdate } = usePwa();

  return (
    <div aria-live="polite" className="sticky top-0 z-50">
      {!online && (
        <div className="pt-safe flex items-center justify-center gap-2 bg-ink px-4 py-2 text-center text-xs font-medium text-bg">
          <WifiOff aria-hidden className="size-3.5 shrink-0" />
          <span>
            You&apos;re offline. AI lessons, quizzes and the tutor need a connection.
            {pendingSync > 0 && ` ${pendingSync} ${pendingSync === 1 ? "activity" : "activities"} will sync when you reconnect.`}
          </span>
        </div>
      )}
      {online && pendingSync > 0 && (
        <div className="pt-safe bg-warn-soft px-4 py-1.5 text-center text-xs text-ink">Syncing {pendingSync} saved {pendingSync === 1 ? "activity" : "activities"}…</div>
      )}
      {updateAvailable && (
        <div className="pt-safe flex items-center justify-center gap-3 bg-accent-soft px-4 py-2 text-xs text-ink">
          <span>A new version of LearnFlow is ready.</span>
          <button type="button" onClick={applyUpdate} className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 font-semibold text-white dark:text-[#0a0f1c]">
            <RefreshCw aria-hidden className="size-3" /> Update
          </button>
        </div>
      )}
    </div>
  );
}
