"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/** False during server render and hydration, true afterwards — without an effect. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/** Subscribes to one or more window events and re-reads a browser value when they fire. */
export function useWindowValue<T>(events: string[], read: () => T, serverValue: T): T {
  return useSyncExternalStore(
    (onChange) => {
      for (const e of events) window.addEventListener(e, onChange);
      return () => {
        for (const e of events) window.removeEventListener(e, onChange);
      };
    },
    read,
    () => serverValue,
  );
}
