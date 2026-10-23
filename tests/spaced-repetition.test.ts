import { describe, expect, it } from "vitest";
import { buildDueQueue, newItemState, schedule, SRS_CONFIG } from "@/lib/learning/spaced-repetition";

const today = "2026-10-23";

describe("schedule", () => {
  it("follows the 1 → 3 → 7 → 14 day ladder on 'good'", () => {
    let s = newItemState();
    const intervals: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = schedule(s, "good", today);
      intervals.push(r.intervalDays);
      s = r;
    }
    expect(intervals).toEqual([1, 3, 7, 14]);
  });

  it("grows by the ease factor after the ladder", () => {
    const r = schedule({ intervalDays: 14, ease: 2.5, repetitions: 4, lapses: 0 }, "good", today);
    expect(r.intervalDays).toBe(35);
    expect(r.dueDate).toBe("2026-11-27");
  });

  it("resets on 'again', counts a lapse and lowers ease", () => {
    const r = schedule({ intervalDays: 14, ease: 2.5, repetitions: 4, lapses: 0 }, "again", today);
    expect(r).toMatchObject({ intervalDays: 1, repetitions: 0, lapses: 1, ease: 2.3, dueDate: "2026-10-24" });
  });

  it("grows slowly on 'hard' and skips ahead on 'easy'", () => {
    const base = { intervalDays: 7, ease: 2.5, repetitions: 3, lapses: 0 };
    expect(schedule(base, "hard", today).intervalDays).toBe(8);
    expect(schedule(base, "easy", today).intervalDays).toBe(21);
  });

  it("never schedules beyond the maximum interval or below the minimum ease", () => {
    const r = schedule({ intervalDays: 170, ease: 3, repetitions: 10, lapses: 0 }, "easy", today);
    expect(r.intervalDays).toBe(SRS_CONFIG.maxIntervalDays);
    let s = { intervalDays: 1, ease: 1.4, repetitions: 0, lapses: 0 };
    s = schedule(s, "again", today);
    expect(s.ease).toBe(SRS_CONFIG.minEase);
  });
});

describe("buildDueQueue", () => {
  const items = [
    { id: "a", due_date: "2026-10-23" },
    { id: "b", due_date: "2026-10-01" },
    { id: "c", due_date: "2026-10-30" },
    { id: "d", due_date: "2026-10-20" },
  ];

  it("returns only due items, most overdue first", () => {
    expect(buildDueQueue(items, today, 10).queue.map((i) => i.id)).toEqual(["b", "d", "a"]);
  });

  it("caps the daily queue to avoid an overwhelming backlog", () => {
    const { queue, overflow } = buildDueQueue(items, today, 2);
    expect(queue.map((i) => i.id)).toEqual(["b", "d"]);
    expect(overflow).toBe(1);
  });
});
