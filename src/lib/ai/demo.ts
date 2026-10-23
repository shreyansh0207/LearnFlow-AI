import type { Interpretation, TopicProposal } from "@/lib/catalog/schemas";
import type { Curriculum, Expansion, LessonContent, Quiz } from "./schemas";
import type { JourneyBrief } from "./prompts";

/**
 * Demo mode (LEARNFLOW_DEMO_MODE=true, no API key): deterministic TEMPLATE
 * content so the full product flow can be exercised without an AI provider.
 * Everything produced here is stored with source = "demo" and is labelled in
 * the UI as template content. It is deliberately generic and never pretends to
 * be subject-matter teaching.
 */

export const DEMO_NOTICE = "Demo mode: this is template content, not AI-generated teaching.";

type Mod = Curriculum["modules"][number];

function demoModule(s: string, minutes: number, title: string, kind: Mod["kind"], level: Mod["level"], topics: string[], milestone: string): Mod {
  return {
    title,
    kind,
    level,
    description: `Template module for ${s}.`,
    milestone,
    topics: topics.map((t, i) => ({
      title: t,
      kind: i === topics.length - 1 ? "assessment" : kind === "project" ? "project" : "concept",
      summary: `Template topic: ${t}.`,
      objectives: [`Describe what "${t}" means in ${s}`, `Give one example of ${t.toLowerCase()}`],
      prerequisites: i > 0 ? [topics[i - 1]] : [],
      estimatedMinutes: Math.min(30, Math.max(10, minutes)),
      hasExercise: true,
      isCheckpoint: i === topics.length - 1,
      sourceRefs: [],
      safetyNote: null,
    })),
  };
}

export function demoCurriculum(b: JourneyBrief): Curriculum {
  const s = b.subject;
  const m = b.minutesPerDay;
  return {
    title: `${s} — from the ground up`,
    summary: `${DEMO_NOTICE} A three-module template journey for ${s}.`,
    learningPattern: "mixed",
    outcomes: [`Explain the basic ideas of ${s}`, `Apply core principles of ${s} to a simple case`],
    prerequisites: [],
    modules: [
      demoModule(s, m, "Foundations", "foundations", "beginner", [`What is ${s}?`, `Core vocabulary of ${s}`, `Foundations checkpoint`], `Explain the basic ideas of ${s} in your own words.`),
      demoModule(s, m, "Core skills", "core", "intermediate", [`Key principles of ${s}`, `Applying ${s} to a simple case`, `Core skills checkpoint`], `Apply the main principles of ${s} to a simple situation.`),
      demoModule(s, m, "Going further", "advanced", "advanced", [`Common mistakes in ${s}`, `Planning your next steps in ${s}`, `Final checkpoint`], `Spot common mistakes and plan further study.`),
    ],
    resources: [],
    limitations: ["Demo template: not real subject teaching."],
  };
}

export function demoExpansion(s: string, focus: string): Expansion {
  return {
    rationale: `${DEMO_NOTICE} Template module added for “${focus}”.`,
    modules: [demoModule(s, 15, `Extra: ${focus}`.slice(0, 200), "specialization", "intermediate", [`Introduction to ${focus}`, `${focus} in practice`, `${focus} checkpoint`], `Describe ${focus} and how it relates to ${s}.`)],
  };
}

/** Heuristic stand-in for AI interpretation (used in demo and unconfigured modes). */
export function heuristicInterpretation(query: string, topic: string): Interpretation {
  const words = topic.split(/\s+/).length;
  return {
    intent: "learn",
    topic,
    goalSummary: query.trim().slice(0, 400),
    scope: words <= 1 ? "broad" : words >= 4 ? "narrow" : "focused",
    learningPattern: "mixed",
    domain: "",
    relatedDomains: [],
    alternativeNames: [],
    clarifyingQuestion: null,
    clarifyingOptions: [],
  };
}

export function demoProposal(topic: string): TopicProposal {
  return {
    name: topic,
    description: `${DEMO_NOTICE} Placeholder structure for “${topic}”. With an AI provider configured, this shows a real description, prerequisites and subtopics.`,
    aliases: [],
    kind: "topic",
    difficulty: "beginner",
    learningPattern: "mixed",
    parentName: null,
    objectives: [`Explain the basics of ${topic}`],
    prerequisites: [],
    subtopics: [
      { name: `Foundations of ${topic}`, description: "Template subtopic." },
      { name: `${topic} in practice`, description: "Template subtopic." },
    ],
    related: [],
    uncertainty: "Demo template — not reviewed and not AI-generated.",
  };
}

export function demoLesson(topicTitle: string, objectives: string[], subject: string): LessonContent {
  return {
    title: topicTitle,
    objectives: objectives.length ? objectives : [`Understand ${topicTitle}`],
    explanation: `**${DEMO_NOTICE}**\n\nThis placeholder shows the structure of a LearnFlow lesson for **${topicTitle}** in ${subject}. With an AI provider configured, this section contains a full beginner-friendly explanation tailored to your level and history.\n\n- Each lesson starts from what you already know.\n- New terms are defined the first time they appear.\n- Examples and exercises make the idea concrete.`,
    keyTerms: [{ term: topicTitle, definition: "Template definition — replaced by a real definition when AI is configured." }],
    analogies: ["Template analogy: learning a topic step by step is like climbing stairs — each step relies on the one before."],
    examples: [{ title: "Template example", body: `A worked example about ${topicTitle} appears here when AI is configured.` }],
    steps: [
      { title: "Read the explanation", detail: "Get the big picture first." },
      { title: "Check yourself", detail: "Answer the quick questions below." },
      { title: "Practise", detail: "Attempt the exercise before reading the model answer." },
    ],
    checkQuestions: [
      {
        question: "Template check: what does a LearnFlow lesson do before introducing a new term?",
        options: ["Skips it", "Defines it", "Hides it", "Tests it first"],
        answerIndex: 1,
        explanation: "Lessons define unfamiliar terms the first time they appear.",
      },
    ],
    exercise: {
      scenario: "Template exercise scenario.",
      task: `Write two sentences about what you expect to learn in "${topicTitle}".`,
      modelAnswer: "There is no single right answer for this template exercise.",
    },
    recap: ["Template recap: lessons move from explanation to examples to practice.", "Quizzes measure understanding separately from completion."],
    nextStep: "Take the quiz to record your understanding, then continue to the next topic.",
    flashcards: [
      { front: `Template card: what is the topic of this lesson?`, back: topicTitle },
      { front: "Template card: does completing a lesson prove mastery?", back: "No — mastery is measured by quizzes and reviews." },
    ],
    disclaimer: null,
  };
}

/** Template quiz about how the lesson is structured — it does not test subject knowledge. */
export function demoQuiz(topicTitle: string): Quiz {
  return {
    questions: [
      {
        prompt: `[Template] Which topic is this quiz attached to?`,
        options: [topicTitle, "An unrelated topic", "No topic", "Every topic"],
        correctIndex: 0,
        explanation: "Each quiz is attached to the topic you just studied.",
        concept: "Quiz scope",
      },
      {
        prompt: "[Template] In LearnFlow, what raises a topic's mastery estimate?",
        options: ["Opening the lesson", "Time on the page", "Correct quiz answers and good recall", "Bookmarking it"],
        correctIndex: 2,
        explanation: "Mastery is based on demonstrated performance, not time spent.",
        concept: "Mastery rules",
      },
      {
        prompt: "[Template] What happens when you rate a review card 'Forgot'?",
        options: ["It is deleted", "It comes back tomorrow", "It is scheduled in a year", "Nothing"],
        correctIndex: 1,
        explanation: "Forgotten cards reset to a one-day interval.",
        concept: "Spaced repetition",
      },
    ],
  };
}

export function demoDiagnostic(topics: string[]): Quiz {
  return {
    questions: topics.slice(0, 5).map((t) => ({
      prompt: `[Template] How familiar are you with "${t}"? (Demo question — pick the first option to mark it familiar.)`,
      options: ["I could explain it to someone", "I've heard of it", "New to me", "Not sure"],
      correctIndex: 0,
      explanation: "Demo diagnostic questions only record self-assessed familiarity.",
      concept: t,
    })),
  };
}

export function demoText(action: string, topicTitle: string): string {
  return `**${DEMO_NOTICE}**\n\nWith an AI provider configured, this would respond to "${action}" for **${topicTitle}**, using your saved learning history.`;
}
