"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { flushQueue, queuedCount, QUEUE_EVENT } from "@/lib/offline-queue";
import { useIsClient, useWindowValue } from "@/lib/use-browser";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __lfDeferredPrompt?: BeforeInstallPromptEvent | null;
    __lfInstalled?: boolean;
  }
  interface Navigator {
    standalone?: boolean;
  }
}

export type Platform = "ios" | "android" | "desktop";

type PwaState = {
  ready: boolean;
  platform: Platform;
  isStandalone: boolean;
  installedThisSession: boolean;
  canPrompt: boolean;
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
  online: boolean;
  pendingSync: number;
  updateAvailable: boolean;
  applyUpdate: () => void;
  swSupported: boolean;
};

const PwaContext = createContext<PwaState | null>(null);

export function usePwa(): PwaState {
  const ctx = useContext(PwaContext);
  if (!ctx) throw new Error("usePwa must be used inside <PwaProvider>");
  return ctx;
}

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  if (/iPad|iPhone|iPod/.test(ua) || iPadOS) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

function detectStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: minimal-ui)").matches || navigator.standalone === true;
}

function subscribeDisplayMode(onChange: () => void) {
  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function PwaProvider({ children }: { children: ReactNode }) {
  // Browser state is read through external-store subscriptions; the inline script
  // in <head> captures install events that fire before hydration.
  const ready = useIsClient();
  const platform = useWindowValue<Platform>([], detectPlatform, "desktop");
  const swSupported = useWindowValue([], () => "serviceWorker" in navigator, false);
  const isStandalone = useSyncExternalStore(subscribeDisplayMode, detectStandalone, () => false);
  const deferred = useWindowValue(["lf-install-available", "lf-installed"], () => window.__lfDeferredPrompt ?? null, null);
  const installedThisSession = useWindowValue(["lf-installed"], () => Boolean(window.__lfInstalled), false);
  const online = useWindowValue(["online", "offline"], () => navigator.onLine, true);
  const pendingSync = useWindowValue([QUEUE_EVENT], queuedCount, 0);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  // Flush queued learning activity on load, on reconnect, and every minute.
  useEffect(() => {
    const sync = () => {
      if (navigator.onLine) void flushQueue();
    };
    window.addEventListener("online", sync);
    sync();
    const interval = window.setInterval(sync, 60_000);
    return () => {
      window.removeEventListener("online", sync);
      window.clearInterval(interval);
    };
  }, []);

  // Service worker registration and update detection.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const enabled = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_SW_IN_DEV === "true";
    if (!enabled) return;
    let cancelled = false;
    let reloading = false;

    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        if (cancelled) return;
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          installing?.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) setWaiting(installing);
          });
        });
        // Check for updates when the app regains focus (installed apps stay open for days).
        const onVisible = () => document.visibilityState === "visible" && reg.update().catch(() => {});
        document.addEventListener("visibilitychange", onVisible);
      })
      .catch((err) => console.warn("Service worker registration failed", err));

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const evt = deferred ?? window.__lfDeferredPrompt ?? null;
    if (!evt) return "unavailable" as const;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    // A prompt event can only be used once.
    window.__lfDeferredPrompt = null;
    if (outcome === "accepted") window.__lfInstalled = true;
    window.dispatchEvent(new Event(outcome === "accepted" ? "lf-installed" : "lf-install-available"));
    return outcome;
  }, [deferred]);

  const applyUpdate = useCallback(() => {
    waiting?.postMessage({ type: "SKIP_WAITING" });
  }, [waiting]);

  const value = useMemo<PwaState>(
    () => ({
      ready,
      platform,
      isStandalone,
      installedThisSession,
      canPrompt: Boolean(deferred),
      promptInstall,
      online,
      pendingSync,
      updateAvailable: Boolean(waiting),
      applyUpdate,
      swSupported,
    }),
    [ready, platform, isStandalone, installedThisSession, deferred, promptInstall, online, pendingSync, waiting, applyUpdate, swSupported],
  );

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

export const INSTALL_CAPTURE_SCRIPT = `
window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__lfDeferredPrompt=e;window.dispatchEvent(new Event('lf-install-available'));});
window.addEventListener('appinstalled',function(){window.__lfInstalled=true;window.__lfDeferredPrompt=null;window.dispatchEvent(new Event('lf-installed'));});
`;
