import { addDays } from "./dates";

/**
 * Spaced repetition scheduler.
 *
 * Early reviews follow a fixed ladder (1 → 3 → 7 → 14 days by default). After the
 * ladder, intervals grow by the item's ease factor, which adapts to recall:
 * "again" resets the item, "hard" grows slowly, "good" follows the ladder,
 * "easy" skips ahead. Intervals are capped so nothing disappears for too long.
 */
export const SRS_CONFIG = {
  ladder: [1, 3, 7, 14],
  minEase: 1.3,
  maxEase: 3.0,
  defaultEase: 2.5,
  maxIntervalDays: 180,
  easyBonus: 1.5,
  hardFactor: 1.2,
  easeDelta: { again: -0.2, hard: -0.15, good: 0, easy: 0.15 },
} as const;

export type Rating = "again" | "hard" | "good" | "easy";

export type SrsState = {
  intervalDays: number;
  ease: number;
  repetitions: number;
  lapses: number;
};

export type SrsResult = SrsState & { dueDate: string };

function clampEase(e: number) {
  return Math.round(Math.min(SRS_CONFIG.maxEase, Math.max(SRS_CONFIG.minEase, e)) * 100) / 100;
}

function ladderOrGrowth(repetitions: number, previousInterval: number, ease: number): number {
  const { ladder } = SRS_CONFIG;
  if (repetitions < ladder.length) return ladder[repetitions];
  return Math.round(Math.max(previousInterval, ladder[ladder.length - 1]) * ease);
}

export function schedule(state: SrsState, rating: Rating, today: string): SrsResult {
  const ease = clampEase(state.ease + SRS_CONFIG.easeDelta[rating]);
  let intervalDays: number;
  let repetitions = state.repetitions;
  let lapses = state.lapses;

  switch (rating) {
    case "again":
      intervalDays = 1;
      repetitions = 0;
      lapses += 1;
      break;
    case "hard":
      // Stay on the current rung; grow only slightly beyond the previous interval.
      intervalDays = Math.max(1, Math.round(Math.max(state.intervalDays, 1) * SRS_CONFIG.hardFactor));
      intervalDays = Math.min(intervalDays, ladderOrGrowth(repetitions, state.intervalDays, ease));
      break;
    case "good":
      intervalDays = ladderOrGrowth(repetitions, state.intervalDays, ease);
      repetitions += 1;
      break;
    case "easy":
      intervalDays = Math.round(ladderOrGrowth(repetitions, state.intervalDays, ease) * SRS_CONFIG.easyBonus);
      repetitions += 2;
      break;
  }

  intervalDays = Math.min(SRS_CONFIG.maxIntervalDays, Math.max(1, intervalDays));
  return { intervalDays, ease, repetitions, lapses, dueDate: addDays(today, intervalDays) };
}

export function newItemState(): SrsState {
  return { intervalDays: 0, ease: SRS_CONFIG.defaultEase, repetitions: 0, lapses: 0 };
}

/**
 * Builds today's queue without creating an overwhelming backlog: most-overdue
 * items first, capped at the learner's daily review limit.
 */
export function buildDueQueue<T extends { due_date: string }>(items: T[], today: string, limit: number): { queue: T[]; overflow: number } {
  const due = items.filter((i) => i.due_date <= today).sort((a, b) => a.due_date.localeCompare(b.due_date));
  return { queue: due.slice(0, limit), overflow: Math.max(0, due.length - limit) };
}

export const RATING_LABEL: Record<Rating, string> = {
  again: "Forgot",
  hard: "Hard",
  good: "Good",
  easy: "Easy",
};
