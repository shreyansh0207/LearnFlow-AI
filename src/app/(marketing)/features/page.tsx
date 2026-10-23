import type { Metadata } from "next";
import { BookOpen, Brain, ChartLine, Flame, Layers, Lock, MessageCircle, RotateCcw, Smartphone, StickyNote, Target, WifiOff } from "lucide-react";
import { ButtonLink, Card } from "@/components/ui";

export const metadata: Metadata = { title: "Features" };

const GROUPS = [
  {
    title: "Personalised learning",
    items: [
      { icon: Target, title: "Goal-based onboarding", body: "Your goal, level, motivation, daily time, preferred formats and deadline shape the plan." },
      { icon: BookOpen, title: "Editable roadmaps", body: "Levels, modules, topics, prerequisites, objectives, durations and checkpoints. Rename, reorder or remove before you begin." },
      { icon: MessageCircle, title: "Lesson controls", body: "Explain more simply, another example, Hinglish, practical case, ask me questions, harder challenge, summarise." },
    ],
  },
  {
    title: "Memory & mastery",
    items: [
      { icon: Brain, title: "Learning memory", body: "Lessons, sessions, quiz answers, mistakes, confidence, notes and reviews — all saved to your account." },
      { icon: ChartLine, title: "Transparent mastery", body: "Mastery comes from quiz accuracy and recall, weighted by clear rules. Time spent never counts as understanding." },
      { icon: RotateCcw, title: "Spaced repetition", body: "Adaptive intervals, a capped daily queue, mistake cards from quizzes, and overdue handling without guilt." },
    ],
  },
  {
    title: "Habits & insight",
    items: [
      { icon: Flame, title: "Honest streaks", body: "A day counts when you complete a lesson, a quiz, or five reviews — calculated in your own timezone." },
      { icon: Layers, title: "Flashcards", body: "Cards created from lessons and your mistakes, plus your own cards." },
      { icon: StickyNote, title: "Notes & bookmarks", body: "Keep notes on any topic and bookmark lessons to revisit." },
    ],
  },
  {
    title: "Everywhere you are",
    items: [
      { icon: Smartphone, title: "Installable app", body: "Add LearnFlow to your Android or iPhone home screen straight from the browser." },
      { icon: WifiOff, title: "Offline fallback", body: "Read lessons you saved for offline; activity made when the connection drops syncs later." },
      { icon: Lock, title: "Private by design", body: "Row-level security means your learning data is only readable by your account." },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
      <h1 className="text-4xl font-semibold tracking-tight">Features</h1>
      <p className="mt-3 max-w-2xl text-muted">Everything LearnFlow does to help you go from zero to real understanding.</p>
      <div className="mt-12 space-y-14">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="text-lg font-semibold">{g.title}</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {g.items.map(({ icon: Icon, title, body }) => (
                <Card key={title}>
                  <Icon aria-hidden className="size-5 text-primary" />
                  <h3 className="mt-3 font-semibold">{title}</h3>
                  <p className="mt-1 text-sm text-muted">{body}</p>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="mt-14 text-center">
        <ButtonLink href="/signup" size="lg">Create your free account</ButtonLink>
      </div>
    </div>
  );
}
