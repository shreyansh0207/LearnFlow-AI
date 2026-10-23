/**
 * Offline-safe POST queue for learning activity (lesson completion, review ratings).
 * Each request carries a client-generated UUID; the server treats that id as an
 * idempotency key, so retries can never double-count progress.
 * Pure queue logic is exported separately for unit tests.
 */

export const QUEUE_KEY = "lf-sync-queue";
export const QUEUE_EVENT = "lf-queue-change";
const MAX_ATTEMPTS = 50;

export type QueuedRequest = { id: string; url: string; body: Record<string, unknown>; createdAt: string; attempts: number };

export type Storage = { getItem(k: string): string | null; setItem(k: string, v: string): void };

export function readQueue(storage: Storage): QueuedRequest[] {
  try {
    const parsed = JSON.parse(storage.getItem(QUEUE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeQueue(storage: Storage, queue: QueuedRequest[]) {
  storage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/** Adds a request unless one with the same id is already queued. */
export function enqueue(queue: QueuedRequest[], req: Omit<QueuedRequest, "attempts" | "createdAt">, now = new Date()): QueuedRequest[] {
  if (queue.some((q) => q.id === req.id)) return queue;
  return [...queue, { ...req, attempts: 0, createdAt: now.toISOString() }];
}

export type SendOutcome = "done" | "retry" | "drop";

/** 2xx: done. 401/408/429/5xx/network: retry later. Other 4xx: the request is invalid; drop it. */
export function classifyStatus(status: number | null): SendOutcome {
  if (status === null) return "retry";
  if (status >= 200 && status < 300) return "done";
  if (status === 401 || status === 408 || status === 429 || status >= 500) return "retry";
  return "drop";
}

export async function processQueue(
  queue: QueuedRequest[],
  send: (req: QueuedRequest) => Promise<number | null>,
): Promise<{ remaining: QueuedRequest[]; sent: number; dropped: number }> {
  const remaining: QueuedRequest[] = [];
  let sent = 0;
  let dropped = 0;
  for (const req of queue) {
    const outcome = classifyStatus(await send(req));
    if (outcome === "done") sent++;
    else if (outcome === "drop" || req.attempts + 1 >= MAX_ATTEMPTS) dropped++;
    else remaining.push({ ...req, attempts: req.attempts + 1 });
  }
  return { remaining, sent, dropped };
}

// ---------------------------------------------------------------------------
// Browser bindings
// ---------------------------------------------------------------------------

function browserStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function notify() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(QUEUE_EVENT));
}

export function queuedCount(): number {
  const s = browserStorage();
  return s ? readQueue(s).length : 0;
}

async function sendOnce(req: QueuedRequest): Promise<number | null> {
  try {
    const res = await fetch(req.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
      credentials: "same-origin",
    });
    return res.status;
  } catch {
    return null;
  }
}

export type PostResult<T> = { status: "sent"; data: T } | { status: "queued" };

/**
 * Sends a learning-activity request now, or queues it if the device is offline or
 * the network fails. Throws for requests the server rejects as invalid.
 */
export async function postOrQueue<T>(url: string, body: Record<string, unknown> & { id: string }): Promise<PostResult<T>> {
  const storage = browserStorage();
  const queueIt = (): PostResult<T> => {
    if (!storage) throw new Error("You appear to be offline and this browser cannot store pending activity.");
    writeQueue(storage, enqueue(readQueue(storage), { id: body.id, url, body }));
    notify();
    return { status: "queued" };
  };

  if (typeof navigator !== "undefined" && navigator.onLine === false) return queueIt();

  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
  } catch {
    return queueIt();
  }
  const outcome = classifyStatus(res.status);
  if (outcome === "done") return { status: "sent", data: (await res.json()) as T };
  if (outcome === "retry" && res.status !== 401) return queueIt();
  const payload = await res.json().catch(() => null);
  throw new Error(payload?.error?.message ?? "The request could not be completed.");
}

let flushing = false;
export async function flushQueue(): Promise<{ sent: number; remaining: number }> {
  const storage = browserStorage();
  if (!storage || flushing) return { sent: 0, remaining: storage ? readQueue(storage).length : 0 };
  flushing = true;
  try {
    const snapshot = readQueue(storage);
    const { remaining, sent } = await processQueue(snapshot, sendOnce);
    // Keep anything queued while we were sending.
    const processedIds = new Set(snapshot.map((q) => q.id));
    const addedMeanwhile = readQueue(storage).filter((q) => !processedIds.has(q.id));
    writeQueue(storage, [...remaining, ...addedMeanwhile]);
    notify();
    return { sent, remaining: remaining.length };
  } finally {
    flushing = false;
  }
}
