import type { MasteryStatus } from "./mastery";

export type OutlineTopic = {
  id: string;
  title: string;
  moduleIndex: number;
  position: number;
  status: MasteryStatus;
  lessonCompleted: boolean;
  /** Learner marked "I already know this". */
  skipped?: boolean;
  estimatedMinutes: number;
};

/** First topic, in curriculum order, that is neither completed nor marked as already known. */
export function nextTopicInOrder<T extends OutlineTopic>(topics: T[]): T | null {
  const ordered = [...topics].sort((a, b) => a.moduleIndex - b.moduleIndex || a.position - b.position);
  return ordered.find((t) => !t.lessonCompleted && !t.skipped) ?? null;
}

export type NextAction =
  | { kind: "practice"; topicId: string; title: string; reason: string }
  | { kind: "review"; count: number; reason: string }
  | { kind: "lesson"; topicId: string; title: string; reason: string }
  | { kind: "create"; reason: string }
  | { kind: "done"; reason: string };

/**
 * Orders what the learner should do next. Struggling topics come first (short,
 * targeted practice), then due reviews, then the next new lesson.
 */
export function recommendActions(input: {
  hasJourney: boolean;
  dueReviews: number;
  practiceTopic: { id: string; title: string } | null;
  nextTopic: { id: string; title: string } | null;
}): NextAction[] {
  const actions: NextAction[] = [];
  if (!input.hasJourney) return [{ kind: "create", reason: "Create your first learning journey to get a personalised roadmap." }];
  if (input.practiceTopic) {
    actions.push({
      kind: "practice",
      topicId: input.practiceTopic.id,
      title: input.practiceTopic.title,
      reason: "Your latest quiz on this topic showed it needs more practice.",
    });
  }
  if (input.dueReviews > 0) {
    actions.push({ kind: "review", count: input.dueReviews, reason: `${input.dueReviews} review${input.dueReviews === 1 ? " is" : "s are"} due today.` });
  }
  if (input.nextTopic) {
    actions.push({ kind: "lesson", topicId: input.nextTopic.id, title: input.nextTopic.title, reason: "Next topic in your roadmap." });
  }
  if (actions.length === 0) actions.push({ kind: "done", reason: "You've completed every lesson in your active journey. Keep reviewing to retain it." });
  return actions;
}

/**
 * Builds the welcome-back message strictly from saved records. Returns null for
 * learners with no history so the UI shows the new-user experience instead.
 */
export function welcomeBackMessage(input: {
  name: string | null;
  lastLesson: { title: string; when: string } | null;
  lastQuiz: { topicTitle: string; score: number; weakConcepts: string[] } | null;
  practiceTopic: { title: string } | null;
}): string | null {
  if (!input.lastLesson && !input.lastQuiz) return null;
  const parts: string[] = [`Welcome back${input.name ? `, ${input.name}` : ""}!`];
  if (input.lastLesson) parts.push(`Last time (${input.lastLesson.when}) you studied “${input.lastLesson.title}”.`);
  if (input.lastQuiz) {
    const pctScore = Math.round(input.lastQuiz.score * 100);
    if (input.lastQuiz.score < 0.6) {
      const concept = input.lastQuiz.weakConcepts[0];
      parts.push(`Your quiz on “${input.lastQuiz.topicTitle}” scored ${pctScore}%${concept ? `, and “${concept}” needs more practice` : ""}.`);
    } else {
      parts.push(`You scored ${pctScore}% on your last quiz (“${input.lastQuiz.topicTitle}”).`);
    }
  }
  if (input.practiceTopic) parts.push(`Let's revise “${input.practiceTopic.title}” for a few minutes before continuing.`);
  return parts.join(" ");
}
