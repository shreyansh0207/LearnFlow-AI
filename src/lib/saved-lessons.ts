import type { LessonContent } from "@/lib/ai/schemas";

/**
 * Lessons the learner explicitly saves for offline reading. Stored on this device
 * only (localStorage) and read by /offline.html when there is no connection.
 * Only lesson content is stored — no credentials or account data.
 */
export const SAVED_KEY = "lf-saved-lessons";
export const SAVED_EVENT = "lf-saved-change";
const MAX_SAVED = 30;

function notify() {
  window.dispatchEvent(new Event(SAVED_EVENT));
}

export type SavedLesson = { topicId: string; title: string; journeyTitle: string; savedAt: string; content: LessonContent };

function read(): Record<string, SavedLesson> {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

export function listSaved(): SavedLesson[] {
  return Object.values(read()).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function isSaved(topicId: string): boolean {
  return Boolean(read()[topicId]);
}

export function saveLesson(lesson: Omit<SavedLesson, "savedAt">): void {
  const all = read();
  all[lesson.topicId] = { ...lesson, savedAt: new Date().toISOString() };
  const trimmed = Object.values(all)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .slice(0, MAX_SAVED);
  localStorage.setItem(SAVED_KEY, JSON.stringify(Object.fromEntries(trimmed.map((l) => [l.topicId, l]))));
  notify();
}

export function removeSaved(topicId: string): void {
  const all = read();
  delete all[topicId];
  localStorage.setItem(SAVED_KEY, JSON.stringify(all));
  notify();
}

/** Called on sign-out so the next person on a shared device sees nothing. */
export function clearDeviceLearningData(): void {
  try {
    localStorage.removeItem(SAVED_KEY);
    localStorage.removeItem("lf-sync-queue");
  } catch {
    // Storage unavailable; nothing to clear.
  }
}
