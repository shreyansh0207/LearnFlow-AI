import { addDays, diffDays } from "./dates";

/**
 * A "learning day" counts toward a streak when the learner, on that local
 * calendar day, completed at least one lesson, submitted at least one quiz, or
 * finished at least MIN_REVIEWS spaced-repetition reviews. Time on the page
 * alone never counts, because it does not show that learning happened.
 */
export const STREAK_RULES = {
  minLessons: 1,
  minQuizzes: 1,
  minReviews: 5,
} as const;

export const STREAK_DEFINITION =
  "A day counts toward your streak when you complete a lesson, submit a quiz, or finish 5 reviews.";

export type DailyActivityRow = {
  local_date: string;
  minutes: number;
  lessons_completed: number;
  quizzes_completed: number;
  reviews_completed: number;
};

export function isMeaningfulDay(row: DailyActivityRow): boolean {
  return (
    row.lessons_completed >= STREAK_RULES.minLessons ||
    row.quizzes_completed >= STREAK_RULES.minQuizzes ||
    row.reviews_completed >= STREAK_RULES.minReviews
  );
}

export type StreakSummary = {
  current: number;
  longest: number;
  /** True when today already counts. */
  todayCounts: boolean;
  /** The streak is still alive but needs activity today to continue. */
  atRisk: boolean;
  lastActiveDate: string | null;
};

/**
 * Computes streaks from the set of meaningful local dates. Duplicated dates are
 * harmless, so recomputation is idempotent by construction.
 */
export function computeStreaks(meaningfulDates: string[], today: string): StreakSummary {
  const days = Array.from(new Set(meaningfulDates)).filter((d) => d <= today).sort();
  if (days.length === 0) return { current: 0, longest: 0, todayCounts: false, atRisk: false, lastActiveDate: null };

  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = diffDays(days[i - 1], days[i]) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  const last = days[days.length - 1];
  const todayCounts = last === today;
  const alive = todayCounts || last === addDays(today, -1);
  let current = 0;
  if (alive) {
    current = 1;
    for (let i = days.length - 1; i > 0 && diffDays(days[i - 1], days[i]) === 1; i--) current++;
  }

  return { current, longest, todayCounts, atRisk: alive && !todayCounts, lastActiveDate: last };
}
