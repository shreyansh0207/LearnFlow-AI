import "server-only";
import type { Db } from "@/lib/db";
import type { Curriculum, CurriculumModule, LessonContent } from "@/lib/ai/schemas";
import { mapTopics } from "@/lib/curriculum/mapping";
import type { SourceDoc } from "@/lib/sources/types";
import { topicKey } from "@/lib/utils";
import { addDays, localDate } from "./dates";
import {
  applyQuizResult,
  applyReviewResult,
  computeMastery,
  masteryStatus,
  type MasteryState,
  type MasteryStatus,
  type ReviewRating,
} from "./mastery";

export class DataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataError";
  }
}

/** Wraps a database step so failures are logged server-side and surfaced as a generic message. */
async function step<T>(context: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[learnflow] ${context}:`, (e as Error).message);
    throw new DataError(`Could not ${context}. Please try again.`);
  }
}

/**
 * Multi-row parameterised INSERT. `table` and `columns` are code constants, never
 * user input; every value is passed as a bind parameter.
 */
export async function insertRows<T = Record<string, unknown>>(db: Db, table: string, columns: string[], rows: unknown[][], suffix = ""): Promise<T[]> {
  if (rows.length === 0) return [];
  const params: unknown[] = [];
  const values = rows.map((r) => `(${r.map((v) => (params.push(v), `$${params.length}`)).join(", ")})`).join(", ");
  return db.query<T>(`insert into ${table} (${columns.join(", ")}) values ${values} ${suffix}`, params);
}

export type EventType = "lesson_started" | "lesson_completed" | "quiz_submitted" | "review_completed" | "tutor_message" | "study_time";

/** Idempotent: returns false if this event id was already recorded. */
export async function recordEvent(
  db: Db,
  timezone: string,
  e: { id: string; type: EventType; journeyId?: string | null; topicId?: string | null; minutes?: number; payload?: Record<string, unknown>; at?: Date },
): Promise<boolean> {
  const row = await step("record your activity", () =>
    db.one<{ ok: boolean }>("select public.record_learning_event($1, $2, $3, $4, $5, $6, $7) as ok", [
      e.id,
      e.type,
      localDate(e.at ?? new Date(), timezone),
      e.journeyId ?? null,
      e.topicId ?? null,
      e.minutes ?? 0,
      e.payload ?? {},
    ]),
  );
  return row.ok === true;
}

type ModuleInsert = { versionId: string; journeyId: string; userId: string; startPosition: number };

/** Inserts modules and topics, mapping per-request citation refs ("S1") to stored source ids. */
async function insertModules(db: Db, modules: CurriculumModule[], at: ModuleInsert, sourceIdByRef: Map<string, string>) {
  const inserted = await insertRows<{ id: string; position: number }>(
    db,
    "public.learning_modules",
    ["version_id", "journey_id", "user_id", "position", "kind", "level", "title", "description", "milestone"],
    modules.map((m, i) => [at.versionId, at.journeyId, at.userId, at.startPosition + i, m.kind, m.level, m.title, m.description, m.milestone]),
    "returning id, position",
  );
  const idByPosition = new Map(inserted.map((m) => [m.position, m.id]));
  const topicRows = modules.flatMap((m, mi) =>
    m.topics.map((t, ti) => [
      idByPosition.get(at.startPosition + mi)!,
      at.versionId,
      at.journeyId,
      at.userId,
      ti,
      topicKey(t.title),
      t.title,
      t.kind,
      t.summary,
      t.objectives,
      t.prerequisites,
      t.estimatedMinutes,
      t.hasExercise,
      t.isCheckpoint,
      t.safetyNote,
      t.sourceRefs.map((r) => sourceIdByRef.get(r)).filter((x): x is string => Boolean(x)),
    ]),
  );
  return insertRows<{ id: string; title: string; topic_key: string }>(
    db,
    "public.learning_topics",
    ["module_id", "version_id", "journey_id", "user_id", "position", "topic_key", "title", "kind", "summary", "objectives", "prerequisites", "estimated_minutes", "has_exercise", "is_checkpoint", "safety_note", "source_refs"],
    topicRows,
    "returning id, title, topic_key",
  );
}

/** Stores retrieved sources privately for this curriculum version. Returns ref → stored id. */
async function insertSources(db: Db, userId: string, versionId: string, sources: SourceDoc[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!sources.length) return map;
  const rows = await insertRows<{ id: string; url: string }>(
    db,
    "public.curriculum_sources",
    ["user_id", "version_id", "url", "title", "provider", "source_type", "authors", "published", "license", "snippet", "retrieved_at"],
    sources.map((s) => [userId, versionId, s.url, s.title, s.provider, s.type, s.authors, s.published, s.license, s.snippet, s.retrievedAt]),
    "on conflict (version_id, url) do update set title = excluded.title returning id, url",
  );
  const idByUrl = new Map(rows.map((r) => [r.url, r.id]));
  for (const s of sources) {
    const id = idByUrl.get(s.url);
    if (id) map.set(s.ref, id);
  }
  return map;
}

/**
 * Stores a curriculum as a new immutable version in ONE transaction, so a
 * failure never leaves a half-saved roadmap. Earlier versions, their topics and
 * every session/attempt that references them are preserved, and progress
 * (mastery, lessons, "already known") carries over to clearly matching topics.
 */
export async function persistCurriculum(
  db: Db,
  userId: string,
  journeyId: string,
  curriculum: Curriculum,
  source: "ai" | "demo",
  model: string | null,
  sources: SourceDoc[] = [],
): Promise<string> {
  return step("save the curriculum", () =>
    db.tx(async (tx) => {
      const latest = await tx.maybeOne<{ id: string; version: number }>(
        "select id, version from public.curriculum_versions where journey_id = $1 order by version desc limit 1",
        [journeyId],
      );
      const sourceUrlByRef = new Map(sources.map((s) => [s.ref, s.url]));
      const version = await tx.one<{ id: string }>(
        `insert into public.curriculum_versions (journey_id, user_id, version, source, model, summary, learning_pattern, outcomes, prerequisites, resources, limitations)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
        [
          journeyId,
          userId,
          (latest?.version ?? 0) + 1,
          source,
          model,
          curriculum.summary,
          curriculum.learningPattern,
          curriculum.outcomes,
          JSON.stringify(curriculum.prerequisites),
          JSON.stringify(curriculum.resources.map((r) => ({ ...r, url: r.sourceRef ? sourceUrlByRef.get(r.sourceRef) ?? null : null }))),
          curriculum.limitations,
        ],
      );

      const refMap = await insertSources(tx, userId, version.id, sources);
      const topics = await insertModules(tx, curriculum.modules, { versionId: version.id, journeyId, userId, startPosition: 0 }, refMap);
      if (latest) await carryOverProgress(tx, userId, journeyId, latest.id, topics);

      await tx.query("update public.learning_journeys set active_version_id = $1, title = $2, learning_pattern = $3 where id = $4", [
        version.id,
        curriculum.title,
        curriculum.learningPattern,
        journeyId,
      ]);
      return version.id;
    }),
  );
}

/**
 * Adds modules to the ACTIVE version in place, in one transaction. Existing
 * modules, topics, lessons and progress are untouched; the change is logged.
 */
export async function appendModules(
  db: Db,
  opts: { userId: string; journeyId: string; versionId: string; modules: CurriculumModule[]; placement: "append" | "prerequisites"; focus: string; rationale: string; sources: SourceDoc[] },
) {
  return step("expand the roadmap", () =>
    db.tx(async (tx) => {
      const existing = await tx.query<{ id: string; position: number }>("select id, position from public.learning_modules where version_id = $1 order by position", [opts.versionId]);
      let start = existing.length ? Math.max(...existing.map((r) => r.position)) + 1 : 0;
      if (opts.placement === "prerequisites") {
        await tx.query("update public.learning_modules set position = position + $1 where version_id = $2", [opts.modules.length, opts.versionId]);
        start = 0;
      }
      const refMap = await insertSources(tx, opts.userId, opts.versionId, opts.sources);
      const topics = await insertModules(tx, opts.modules, { versionId: opts.versionId, journeyId: opts.journeyId, userId: opts.userId, startPosition: start }, refMap);
      const change = { type: "expanded", at: new Date().toISOString(), focus: opts.focus.slice(0, 200), placement: opts.placement, modules: opts.modules.map((m) => m.title), rationale: opts.rationale };
      // Keep the last 50 change entries.
      await tx.query(
        `update public.curriculum_versions
            set changes = (select coalesce(jsonb_agg(e), '[]'::jsonb) from (select e from jsonb_array_elements(changes || $1::jsonb) e offset greatest(jsonb_array_length(changes) + 1 - 50, 0)) s)
          where id = $2`,
        [JSON.stringify([change]), opts.versionId],
      );
      return topics;
    }),
  );
}

async function carryOverProgress(db: Db, userId: string, journeyId: string, previousVersionId: string, newTopics: Array<{ id: string; title: string; topic_key: string }>) {
  const oldTopics = await db.query<{ id: string; title: string; topic_key: string }>("select id, title, topic_key from public.learning_topics where version_id = $1", [previousVersionId]);
  const mapping = mapTopics(
    oldTopics.map((t) => ({ id: t.id, title: t.title, key: t.topic_key })),
    newTopics.map((t) => ({ id: t.id, title: t.title, key: t.topic_key })),
  );
  if (mapping.size === 0) return;
  // Pairs (new topic id, old topic id) passed as two aligned arrays.
  const newIds = [...mapping.keys()];
  const oldIds = newIds.map((n) => mapping.get(n)!);

  await db.query(
    `insert into public.topic_mastery (user_id, topic_id, journey_id, mastery, quiz_ema, recall_ema, confidence, quiz_attempts, best_score, last_score, status, lesson_completed_at, skipped_at)
     select $1, p.new_id, $2, m.mastery, m.quiz_ema, m.recall_ema, m.confidence, m.quiz_attempts, m.best_score, m.last_score, m.status, m.lesson_completed_at, m.skipped_at
       from unnest($3::uuid[], $4::uuid[]) as p(new_id, old_id)
       join public.topic_mastery m on m.topic_id = p.old_id
     on conflict (user_id, topic_id) do nothing`,
    [userId, journeyId, newIds, oldIds],
  );
  // Reuse already-generated lessons so learners don't wait for them again.
  await db.query(
    `insert into public.lessons (topic_id, user_id, variant, content, source, model)
     select p.new_id, $1, l.variant, l.content, l.source, l.model
       from unnest($2::uuid[], $3::uuid[]) as p(new_id, old_id)
       join public.lessons l on l.topic_id = p.old_id
     on conflict (topic_id, variant) do nothing`,
    [userId, newIds, oldIds],
  );
}

/** "I already know this": recorded separately from completion and mastery. */
export async function setTopicSkipped(db: Db, userId: string, topicId: string, journeyId: string, skipped: boolean) {
  await step("update the topic", () =>
    db.query(
      `insert into public.topic_mastery (user_id, topic_id, journey_id, skipped_at) values ($1, $2, $3, case when $4 then now() end)
       on conflict (user_id, topic_id) do update set skipped_at = case when $4 then now() end, updated_at = now()`,
      [userId, topicId, journeyId, skipped],
    ),
  );
}

type MasteryRow = {
  mastery: number;
  quiz_ema: number | null;
  recall_ema: number | null;
  confidence: number | null;
  quiz_attempts: number;
  best_score: number | null;
  last_score: number | null;
  status: MasteryStatus;
  lesson_completed_at: string | null;
};

async function loadMastery(db: Db, userId: string, topicId: string): Promise<MasteryRow | null> {
  return db.maybeOne<MasteryRow>(
    "select mastery, quiz_ema, recall_ema, confidence, quiz_attempts, best_score, last_score, status, lesson_completed_at from public.topic_mastery where user_id = $1 and topic_id = $2",
    [userId, topicId],
  );
}

function toState(row: MasteryRow | null): MasteryState {
  return {
    quizEma: row?.quiz_ema ?? null,
    recallEma: row?.recall_ema ?? null,
    confidence: row?.confidence ?? null,
    quizAttempts: row?.quiz_attempts ?? 0,
    lessonCompleted: Boolean(row?.lesson_completed_at),
  };
}

async function saveMastery(
  db: Db,
  userId: string,
  topicId: string,
  journeyId: string,
  state: MasteryState,
  extra: { last_score?: number; best_score?: number; lesson_completed_at?: string } = {},
) {
  const mastery = computeMastery(state);
  const status = masteryStatus(state, mastery);
  await step("update your mastery estimate", () =>
    db.query(
      `insert into public.topic_mastery (user_id, topic_id, journey_id, mastery, quiz_ema, recall_ema, confidence, quiz_attempts, status, last_score, best_score, lesson_completed_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
       on conflict (user_id, topic_id) do update set
         mastery = excluded.mastery, quiz_ema = excluded.quiz_ema, recall_ema = excluded.recall_ema, confidence = excluded.confidence,
         quiz_attempts = excluded.quiz_attempts, status = excluded.status,
         last_score = coalesce(excluded.last_score, topic_mastery.last_score),
         best_score = coalesce(excluded.best_score, topic_mastery.best_score),
         lesson_completed_at = coalesce(topic_mastery.lesson_completed_at, excluded.lesson_completed_at),
         updated_at = now()`,
      [userId, topicId, journeyId, mastery, state.quizEma, state.recallEma, state.confidence, state.quizAttempts, status, extra.last_score ?? null, extra.best_score ?? null, extra.lesson_completed_at ?? null],
    ),
  );
  return { mastery, status };
}

export async function applyQuizToMastery(db: Db, userId: string, topicId: string, journeyId: string, score: number) {
  const row = await loadMastery(db, userId, topicId);
  const next = applyQuizResult(toState(row), score);
  return saveMastery(db, userId, topicId, journeyId, next, { last_score: score, best_score: Math.max(score, row?.best_score ?? 0) });
}

export async function applyReviewToMastery(db: Db, userId: string, topicId: string, journeyId: string, rating: ReviewRating) {
  const row = await loadMastery(db, userId, topicId);
  return saveMastery(db, userId, topicId, journeyId, applyReviewResult(toState(row), rating));
}

/**
 * Marks a topic studied (one transaction). Completion is separate from mastery:
 * it moves the topic to "in_progress" (or keeps assessed status) and seeds
 * spaced-repetition cards the first time only.
 */
export async function completeLesson(
  db: Db,
  opts: {
    userId: string;
    timezone: string;
    topicId: string;
    journeyId: string;
    confidence: number | null;
    durationSeconds: number;
    lesson: LessonContent | null;
    lessonSource: "ai" | "demo" | null;
  },
) {
  const { userId, topicId, journeyId } = opts;
  const duration = Math.min(86400, Math.max(0, Math.round(opts.durationSeconds)));
  return db.tx(async (tx) => {
    const open = await tx.maybeOne<{ id: string }>(
      "select id from public.lesson_sessions where topic_id = $1 and completed_at is null order by started_at desc limit 1",
      [topicId],
    );
    await step("save your lesson session", () =>
      open
        ? tx.query("update public.lesson_sessions set completed_at = now(), duration_seconds = $1, confidence = $2 where id = $3", [duration, opts.confidence, open.id])
        : tx.query("insert into public.lesson_sessions (user_id, topic_id, journey_id, completed_at, duration_seconds, confidence) values ($1, $2, $3, now(), $4, $5)", [
            userId,
            topicId,
            journeyId,
            duration,
            opts.confidence,
          ]),
    );

    const row = await loadMastery(tx, userId, topicId);
    const state: MasteryState = { ...toState(row), lessonCompleted: true, confidence: opts.confidence ?? row?.confidence ?? null };
    const result = await saveMastery(tx, userId, topicId, journeyId, state, { lesson_completed_at: new Date().toISOString() });

    await tx.query("update public.learning_journeys set last_topic_id = $1, last_studied_at = now(), status = 'active' where id = $2", [topicId, journeyId]);

    // Seed review cards only the first time this topic is completed.
    const existing = await tx.count("select count(*)::int as count from public.review_items where topic_id = $1 and kind in ('topic', 'flashcard')", [topicId]);
    if (existing === 0 && opts.lesson) {
      const due = addDays(localDate(new Date(), opts.timezone), 1);
      const source = opts.lessonSource ?? "system";
      const cards: Array<[string, string, string, string]> = [
        ["topic", `Recall the key ideas of “${opts.lesson.title}”.`, opts.lesson.recap.map((r) => `- ${r}`).join("\n") || opts.lesson.title, "system"],
        ...opts.lesson.flashcards.slice(0, 4).map((f): [string, string, string, string] => ["flashcard", f.front, f.back, source]),
      ];
      await insertRows(
        tx,
        "public.review_items",
        ["user_id", "journey_id", "topic_id", "kind", "front", "back", "source", "due_date"],
        cards.map(([kind, front, back, src]) => [userId, journeyId, topicId, kind, front, back, src, due]),
      );
    }
    return result;
  });
}
