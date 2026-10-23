import { describe, expect, it } from "vitest";
import { classifyStatus, enqueue, processQueue, readQueue, writeQueue, type QueuedRequest } from "@/lib/offline-queue";

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

describe("offline queue", () => {
  it("deduplicates by event id so a double tap is queued once", () => {
    let q: QueuedRequest[] = [];
    q = enqueue(q, { id: "e1", url: "/api/events", body: { id: "e1" } });
    q = enqueue(q, { id: "e1", url: "/api/events", body: { id: "e1" } });
    expect(q).toHaveLength(1);
  });

  it("persists across reloads and survives corrupt storage", () => {
    const s = memoryStorage();
    writeQueue(s, enqueue([], { id: "e1", url: "/x", body: {} }));
    expect(readQueue(s)).toHaveLength(1);
    s.setItem("lf-sync-queue", "{not json");
    expect(readQueue(s)).toEqual([]);
  });

  it("classifies responses into done / retry / drop", () => {
    expect(classifyStatus(200)).toBe("done");
    expect(classifyStatus(null)).toBe("retry");
    expect(classifyStatus(503)).toBe("retry");
    expect(classifyStatus(429)).toBe("retry");
    expect(classifyStatus(401)).toBe("retry");
    expect(classifyStatus(400)).toBe("drop");
    expect(classifyStatus(404)).toBe("drop");
  });

  it("removes sent items, keeps failures for retry, and drops invalid ones", async () => {
    let q: QueuedRequest[] = [];
    for (const id of ["ok", "offline", "invalid"]) q = enqueue(q, { id, url: "/x", body: { id } });
    const status: Record<string, number | null> = { ok: 200, offline: null, invalid: 400 };
    const { remaining, sent, dropped } = await processQueue(q, async (r) => status[r.id]);
    expect(sent).toBe(1);
    expect(dropped).toBe(1);
    expect(remaining.map((r) => r.id)).toEqual(["offline"]);
    expect(remaining[0].attempts).toBe(1);
  });

  it("replaying the same event is safe because the server treats the id as idempotent", async () => {
    const serverSeen = new Set<string>();
    let counted = 0;
    const send = async (r: QueuedRequest) => {
      if (!serverSeen.has(r.id)) {
        serverSeen.add(r.id);
        counted++;
      }
      return 200;
    };
    const q = enqueue([], { id: "e1", url: "/x", body: {} });
    await processQueue(q, send);
    await processQueue(q, send); // simulated replay after a lost response
    expect(counted).toBe(1);
  });
});
