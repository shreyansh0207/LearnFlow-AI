import Link from "next/link";
import { ArrowRight, Brain, CircleCheck, Compass, Languages, MessageCircle, RotateCcw, Smartphone, Sparkles, Target } from "lucide-react";
import { ButtonLink, Card } from "@/components/ui";

const SUBJECTS = [
  "Personal finance",
  "Real estate investing",
  "Psychology",
  "AI & programming",
  "Entrepreneurship",
  "Marketing",
  "Economics",
  "Leadership & communication",
];

const FEATURES = [
  { icon: Compass, title: "A roadmap built for you", body: "Tell LearnFlow your goal, level and time. It designs modules and bite-sized topics in the right order — and you can edit it before you start." },
  { icon: Sparkles, title: "Lessons that start from zero", body: "Plain-language explanations, defined terms, everyday analogies, worked examples and exercises — one manageable segment at a time." },
  { icon: Brain, title: "It remembers what you learned", body: "Every lesson, quiz answer and review is saved. When you return, LearnFlow knows where you stopped and what needs work." },
  { icon: Target, title: "Mastery, not just completion", body: "Finishing a lesson isn't the same as understanding it. Quizzes and recall reviews measure what you actually know." },
  { icon: RotateCcw, title: "Spaced revision", body: "Flashcards and recall prompts come back at the right moment — 1, 3, 7, 14 days and beyond — without an overwhelming backlog." },
  { icon: MessageCircle, title: "A tutor that knows your history", body: "Ask questions anytime. The AI tutor sees your progress and mistakes, so its help fits where you are." },
];

export default function LandingPage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 h-[480px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(15,118,110,0.16),transparent_70%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div className="animate-fade-up">
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
              <Smartphone aria-hidden className="size-3.5 text-primary" /> Works in your browser · installs on Android & iPhone
            </p>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Learn anything <span className="text-gradient">from zero.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted text-pretty">
              Follow your own path. Remember what matters. Build real understanding, one day at a time — with an AI learning companion that remembers your journey.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/signup" size="lg">
                Start learning free <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
              <ButtonLink href="/how-it-works" size="lg" variant="secondary">
                See how it works
              </ButtonLink>
            </div>
            <ul className="mt-8 grid gap-2 text-sm text-muted sm:grid-cols-2">
              {["Any subject — including your own", "Adaptive lessons & quizzes", "Daily revision that sticks", "Explain in Hinglish on request"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <CircleCheck aria-hidden className="size-4 text-primary" /> {t}
                </li>
              ))}
            </ul>
          </div>

          {/* Illustrative product preview — sample content, not user data. */}
          <div className="relative animate-fade-up [animation-delay:80ms]">
            <Card className="relative p-0">
              <div className="brand-gradient rounded-t-2xl px-5 py-4 text-white">
                <p className="text-xs uppercase tracking-wide text-white/75">Example journey</p>
                <p className="mt-1 text-lg font-semibold">Personal finance — from zero</p>
              </div>
              <div className="space-y-3 p-5">
                {[
                  { t: "What money actually is", s: "Completed", tone: "text-success" },
                  { t: "Simple vs compound interest", s: "Needs practice", tone: "text-warn" },
                  { t: "Building a budget that works", s: "Up next", tone: "text-primary" },
                  { t: "Emergency funds", s: "Locked", tone: "text-muted" },
                ].map((row, i) => (
                  <div key={row.t} className="flex items-center gap-3 rounded-xl border border-border p-3">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-surface-2 text-sm font-semibold text-muted">{i + 1}</span>
                    <span className="flex-1 text-sm font-medium">{row.t}</span>
                    <span className={`text-xs font-medium ${row.tone}`}>{row.s}</span>
                  </div>
                ))}
                <div className="rounded-xl bg-primary-soft p-3 text-sm">
                  <p className="font-medium text-primary">Welcome back!</p>
                  <p className="mt-0.5 text-muted">Your last quiz showed compound interest needs more practice. Let&apos;s revise it for five minutes before continuing.</p>
                </div>
              </div>
            </Card>
            <p className="mt-2 text-center text-xs text-muted">Illustration with sample content</p>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <p className="text-center text-sm font-medium text-muted">Start with a popular subject — or type anything you want to learn</p>
          <ul className="mt-5 flex flex-wrap justify-center gap-2">
            {SUBJECTS.map((s) => (
              <li key={s} className="rounded-full border border-border px-3.5 py-1.5 text-sm">{s}</li>
            ))}
            <li className="rounded-full border border-dashed border-primary px-3.5 py-1.5 text-sm text-primary">+ your own topic</li>
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <h2 className="text-center text-3xl font-semibold tracking-tight">A real learning companion, not a course catalogue</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-muted">Everything adapts to what you&apos;ve actually done — and nothing is ever made up about your progress.</p>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <Card key={title}>
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <Icon aria-hidden className="size-5" />
              </div>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="brand-gradient grid gap-8 overflow-hidden rounded-3xl p-8 text-white sm:p-12 lg:grid-cols-[1.4fr_1fr] lg:items-center">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Put LearnFlow on your home screen</h2>
            <p className="mt-3 max-w-lg text-white/80">
              Install it straight from your browser — no app store required. It opens full-screen like a native app, works on Android and iPhone, and shows an offline screen with your saved lessons when you lose signal.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href="/install" variant="secondary" className="border-transparent">
                <Smartphone aria-hidden className="size-4" /> How to install
              </ButtonLink>
              <ButtonLink href="/signup" variant="ghost" className="text-white hover:bg-white/10">
                Create your account
              </ButtonLink>
            </div>
          </div>
          <ul className="space-y-3 text-sm text-white/85">
            <li className="flex gap-2"><CircleCheck aria-hidden className="size-4 shrink-0" /> Android: one-tap install in Chrome, Edge or Samsung Internet</li>
            <li className="flex gap-2"><CircleCheck aria-hidden className="size-4 shrink-0" /> iPhone & iPad: Share → Add to Home Screen</li>
            <li className="flex gap-2"><Languages aria-hidden className="size-4 shrink-0" /> Explanations in English or Hinglish</li>
          </ul>
        </div>
        <p className="mt-6 text-center text-xs text-muted">
          LearnFlow provides general education. For finance, real-estate, legal or medical decisions, consult a qualified professional. <Link href="/terms" className="underline">Terms</Link>
        </p>
      </section>
    </>
  );
}
