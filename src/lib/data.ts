import "server-only";
import type { Db } from "@/lib/db";
import type { MasteryStatus } from "@/lib/learning/mastery";
import { nextTopicInOrder, type OutlineTopic } from "@/lib/learning/recommend";

export type JourneyRow = {
  id: string;
  title: string;
  subject: string;
  goal: string | null;
  motivation: string | null;
  current_level: string;
  target_level: string;
  minutes_per_day: number;
  days_per_week: number;
  learning_styles: string[];
  deadline: string | null;
  status: string;
  active_version_id: string | null;
  last_topic_id: string | null;
  last_studied_at: string | null;
  created_at: string;
};

export type TopicRow = {
  id: string;
  module_id: string;
  position: number;
  title: string;
  summary: string | null;
  objectives: string[];
  prerequisites: string[];
  estimated_minutes: number;
  has_exercise: boolean;
  is_checkpoint: boolean;
  kind: string;
  source_refs: string[];
  safety_note: string | null;
};

export type ModuleRow = {
  id: string;
  position: number;
  kind: string;
  level: string;
  title: string;
  description: string | null;
  milestone: string | null;
};

export type MasteryRow = {
  topic_id: string;
  mastery: number;
  status: MasteryStatus;
  last_score: number | null;
  quiz_attempts: number;
  lesson_completed_at: string | null;
  skipped_at: string | null;
};

export type OutlineModule = ModuleRow & { topics: Array<TopicRow & { mastery: MasteryRow | null }> };

export type JourneyOutline = {
  journey: JourneyRow;
  version: { id: string; version: number; source: "ai" | "demo"; created_at: string } | null;
  modules: OutlineModule[];
  flatTopics: Array<OutlineTopic & { moduleTitle: string }>;
  completedCount: number;
  totalCount: number;
};

export const JOURNEY_COLUMNS =
  "id, title, subject, goal, motivation, current_level, target_level, minutes_per_day, days_per_week, learning_styles, deadline, status, active_version_id, last_topic_id, last_studied_at, created_at";

export async function getJourneyOutline(db: Db, journeyId: string): Promise<JourneyOutline | null> {
  const j = await db.maybeOne<JourneyRow>(`select ${JOURNEY_COLUMNS} from public.learning_journeys where id = $1`, [journeyId]);
  if (!j) return null;
  if (!j.active_version_id) return { journey: j, version: null, modules: [], flatTopics: [], completedCount: 0, totalCount: 0 };

  const [version, modules, topics, mastery] = await Promise.all([
    db.maybeOne<NonNullable<JourneyOutline["version"]>>("select id, version, source, created_at from public.curriculum_versions where id = $1", [j.active_version_id]),
    db.query<ModuleRow>("select id, position, kind, level, title, description, milestone from public.learning_modules where version_id = $1 order by position", [j.active_version_id]),
    db.query<TopicRow>(
      `select id, module_id, position, title, summary, objectives, prerequisites, estimated_minutes, has_exercise, is_checkpoint, kind, source_refs, safety_note
         from public.learning_topics where version_id = $1 order by position`,
      [j.active_version_id],
    ),
    db.query<MasteryRow>("select topic_id, mastery, status, last_score, quiz_attempts, lesson_completed_at, skipped_at from public.topic_mastery where journey_id = $1", [journeyId]),
  ]);

  const masteryByTopic = new Map(mastery.map((m) => [m.topic_id, m]));
  const outlineModules: OutlineModule[] = modules.map((m) => ({
    ...m,
    topics: topics
      .filter((t) => t.module_id === m.id)
      .sort((a, b) => a.position - b.position)
      .map((t) => ({ ...t, mastery: masteryByTopic.get(t.id) ?? null })),
  }));

  const flatTopics = outlineModules.flatMap((m, mi) =>
    m.topics.map((t) => ({
      id: t.id,
      title: t.title,
      moduleIndex: mi,
      position: t.position,
      status: (t.mastery?.status ?? "not_started") as MasteryStatus,
      lessonCompleted: Boolean(t.mastery?.lesson_completed_at),
      skipped: Boolean(t.mastery?.skipped_at),
      estimatedMinutes: t.estimated_minutes,
      moduleTitle: m.title,
    })),
  );

  return {
    journey: j,
    version: version ?? null,
    modules: outlineModules,
    flatTopics,
    completedCount: flatTopics.filter((t) => t.lessonCompleted).length,
    totalCount: flatTopics.length,
  };
}

export function nextTopic(outline: JourneyOutline) {
  return nextTopicInOrder(outline.flatTopics);
}

/** Loads a topic plus its module and journey, scoped to the current user by RLS. */
export async function getTopicContext(db: Db, topicId: string) {
  const row = await db.maybeOne<
    TopicRow & {
      version_id: string;
      journey_id: string;
      m_id: string;
      m_title: string;
      m_level: string;
      m_position: number;
      j_title: string;
      j_subject: string;
      j_active_version_id: string | null;
    }
  >(
    `select t.id, t.title, t.summary, t.objectives, t.prerequisites, t.estimated_minutes, t.has_exercise, t.is_checkpoint, t.kind,
            t.source_refs, t.safety_note, t.position, t.module_id, t.version_id, t.journey_id,
            m.id as m_id, m.title as m_title, m.level as m_level, m.position as m_position,
            j.title as j_title, j.subject as j_subject, j.active_version_id as j_active_version_id
       from public.learning_topics t
       join public.learning_modules m on m.id = t.module_id
       join public.learning_journeys j on j.id = t.journey_id
      where t.id = $1`,
    [topicId],
  );
  if (!row) return null;
  return {
    topic: row,
    module: { id: row.m_id, title: row.m_title, level: row.m_level, position: row.m_position },
    journey: { id: row.journey_id, title: row.j_title, subject: row.j_subject, active_version_id: row.j_active_version_id },
    isCurrentVersion: row.j_active_version_id === row.version_id,
  };
}

export async function getDueReviewCount(db: Db, today: string): Promise<number> {
  return db.count("select count(*)::int as count from public.review_items where not suspended and due_date <= $1", [today]);
}
