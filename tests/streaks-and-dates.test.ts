import { describe, expect, it } from "vitest";
import { addDays, diffDays, isValidTimeZone, lastNDays, localDate, safeTimeZone } from "@/lib/learning/dates";
import { computeStreaks, isMeaningfulDay } from "@/lib/learning/streaks";

describe("localDate across timezones", () => {
  // 2026-10-23T20:00Z is already the 24th in India but still the 23rd in California.
  const instant = new Date("2026-10-23T20:00:00Z");

  it("uses the learner's timezone, not the server's", () => {
    expect(localDate(instant, "UTC")).toBe("2026-10-23");
    expect(localDate(instant, "Asia/Kolkata")).toBe("2026-10-24");
    expect(localDate(instant, "America/Los_Angeles")).toBe("2026-10-23");
    expect(localDate(instant, "Pacific/Kiritimati")).toBe("2026-10-24");
  });

  it("handles a session that crosses local midnight", () => {
    const before = new Date("2026-10-23T18:29:00Z"); // 23:59 IST
    const after = new Date("2026-10-23T18:31:00Z"); // 00:01 IST next day
    expect(localDate(before, "Asia/Kolkata")).toBe("2026-10-23");
    expect(localDate(after, "Asia/Kolkata")).toBe("2026-10-24");
  });

  it("is correct across a daylight-saving change", () => {
    // US DST ends 2026-11-01 at 2am local.
    expect(localDate(new Date("2026-11-01T06:30:00Z"), "America/New_York")).toBe("2026-11-01");
    expect(localDate(new Date("2026-11-02T04:30:00Z"), "America/New_York")).toBe("2026-11-01");
  });

  it("falls back to UTC for invalid timezones", () => {
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(safeTimeZone("Mars/Olympus")).toBe("UTC");
    expect(safeTimeZone(null)).toBe("UTC");
  });
});

describe("date arithmetic", () => {
  it("adds and diffs calendar days, including month/year boundaries and leap days", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(diffDays("2026-10-01", "2026-10-23")).toBe(22);
    expect(lastNDays("2026-10-23", 3)).toEqual(["2026-10-21", "2026-10-22", "2026-10-23"]);
  });
});

describe("computeStreaks", () => {
  const today = "2026-10-23";

  it("is zero with no history", () => {
    expect(computeStreaks([], today)).toMatchObject({ current: 0, longest: 0, todayCounts: false });
  });

  it("counts consecutive days ending today", () => {
    expect(computeStreaks(["2026-10-21", "2026-10-22", "2026-10-23"], today)).toMatchObject({ current: 3, longest: 3, todayCounts: true, atRisk: false });
  });

  it("keeps the streak alive (at risk) until the learner's day ends", () => {
    expect(computeStreaks(["2026-10-21", "2026-10-22"], today)).toMatchObject({ current: 2, todayCounts: false, atRisk: true });
  });

  it("resets after a missed day but remembers the longest streak", () => {
    const r = computeStreaks(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-20"], today);
    expect(r.current).toBe(0);
    expect(r.longest).toBe(4);
  });

  it("is idempotent: duplicate dates never inflate the streak", () => {
    const r = computeStreaks(["2026-10-22", "2026-10-22", "2026-10-23", "2026-10-23", "2026-10-23"], today);
    expect(r).toMatchObject({ current: 2, longest: 2 });
  });

  it("ignores dates after 'today' (clock skew)", () => {
    expect(computeStreaks(["2026-10-23", "2026-10-24"], today).current).toBe(1);
  });

  it("evaluates the same activity differently for learners in different timezones", () => {
    const session = new Date("2026-10-23T20:00:00Z");
    const india = computeStreaks([localDate(session, "Asia/Kolkata")], "2026-10-24");
    const california = computeStreaks([localDate(session, "America/Los_Angeles")], "2026-10-23");
    expect(india.todayCounts).toBe(true);
    expect(california.todayCounts).toBe(true);
  });
});

describe("isMeaningfulDay", () => {
  const base = { local_date: "2026-10-23", minutes: 0, lessons_completed: 0, quizzes_completed: 0, reviews_completed: 0 };
  it("counts lessons, quizzes or 5 reviews — never time alone", () => {
    expect(isMeaningfulDay({ ...base, minutes: 120 })).toBe(false);
    expect(isMeaningfulDay({ ...base, lessons_completed: 1 })).toBe(true);
    expect(isMeaningfulDay({ ...base, quizzes_completed: 1 })).toBe(true);
    expect(isMeaningfulDay({ ...base, reviews_completed: 4 })).toBe(false);
    expect(isMeaningfulDay({ ...base, reviews_completed: 5 })).toBe(true);
  });
});
