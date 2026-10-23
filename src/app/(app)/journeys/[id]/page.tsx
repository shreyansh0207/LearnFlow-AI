import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleAlert, CircleCheck, Clock, Compass, ExternalLink, Info, Target } from "lucide-react";
import { AdjustGoalForm, ExpandCurriculumForm, RunReviewButton } from "@/components/curriculum-tools";
import { GenerateCurriculumButton, Roadmap } from "@/components/roadmap";
import { JourneyControls, StartJourneyButton } from "@/components/journey-controls";
import { Alert, Badge, ButtonLink, Card, CardTitle, EmptyState, ProgressBar, SourceBadge } from "@/components/ui";
import type { CurriculumReview } from "@/lib/ai/schemas";
import { requireUser } from "@/lib/auth";
import { PATTERN_LABEL, type LearningPattern } from "@/lib/catalog/patterns";
import { analyzeCoverage, SCOPE_STATEMENT, summarizeChecks, type CoverageCheck } from "@/lib/curriculum/coverage";
import { getJourneyOutline, nextTopic } from "@/lib/data";
import { formatRelative } from "@/lib/learning/dates";
import { cn, isUuid } from "@/lib/utils";
import { CURRENT_LEVEL_LABEL, TARGET_LEVEL_LABEL } from "@/lib/validation";

export const metadata: Metadata = { title: "Roadmap" };

type VersionExtra = {
  learning_pattern: string | null;
  outcomes: string[];
  prerequisites: Array<{ name: string; reason: string }>;
  resources: Array<{ title: string; kind: string; note: string; url: string | null }>;
  limitations: string[];
  coverage: { review: CurriculumReview; reviewedAt: string; versionModules?: number } | null;
  changes: Array<{ type: string; at: string; focus: string; modules: string[] }>;
};

const CHECK_ICON = { ok: CircleCheck, attention: CircleAlert, info: Info } as const;
const CHECK_TONE = { ok: "text-success", attention: "text-warn", info: "text-muted" } as const;

function CheckRow({ c }: { c: CoverageCheck }) {
  const Icon = CHECK_ICON[c.status];
  return (
    <li className="flex gap-2.5 py-2.5">
      <Icon aria-label={c.status === "ok" ? "Looks good" : c.status === "attention" ? "Needs attention" : "Note"} className={cn("mt-0.5 size-4 shrink-0", CHECK_TONE[c.status])} />
      <div className="min-w-0 text-sm">
        <p className="font-medium">{c.label}</p>
        <p className="text-muted">{c.detail}</p>
        {c.items && c.items.length > 0 && c.status !== "ok" && (
          <ul className="mt-1 list-disc pl-4 text-xs text-muted">
            {c.items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

const REVIEW_SECTIONS: Array<[keyof CurriculumReview, string]> = [
  ["missingPrerequisites", "Missing prerequisites"],
  ["missingSubtopics", "Missing subtopics"],
  ["orderingIssues", "Ordering issues"],
  ["unexplainedTerms", "Terms used before they're explained"],
  ["practicalGaps", "Practical application gaps"],
  ["assessmentGaps", "Assessment gaps"],
  ["uncertainClaims", "Uncertain or fast-changing areas"],
  ["outOfScope", "Not covered (outside this scope)"],
];

export default async function JourneyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string; genError?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const { db } = await requireUser(`/journeys/${id}`);
  const outline = await getJourneyOutline(db, id);
  if (!outline) notFound();

  const { journey: j, version, modules, completedCount, totalCount } = outline;
  type SourceRow = { id: string; url: string; title: string; provider: string; source_type: string; authors: string | null; published: string | null; license: string | null; retrieved_at: string };
  const [jExtra, extra, sources] = await Promise.all([
    db.maybeOne<{ learning_pattern: string | null; scope_notes: string | null; node_id: string | null; node_name: string | null; node_status: string | null }>(
      `select j.learning_pattern, j.scope_notes, n.id as node_id, n.name as node_name, n.status as node_status
         from public.learning_journeys j left join public.knowledge_nodes n on n.id = j.knowledge_node_id where j.id = $1`,
      [id],
    ),
    version
      ? db.maybeOne<VersionExtra>("select learning_pattern, outcomes, prerequisites, resources, limitations, coverage, changes from public.curriculum_versions where id = $1", [version.id])
      : Promise.resolve(null),
    version
      ? db.query<SourceRow>("select id, url, title, provider, source_type, authors, published, license, retrieved_at from public.curriculum_sources where version_id = $1 order by created_at", [version.id])
      : Promise.resolve([] as SourceRow[]),
  ]);
  const node = jExtra?.node_id ? { id: jExtra.node_id, name: jExtra.node_name ?? "", status: jExtra.node_status ?? "proposed" } : null;
  const pattern = (jExtra?.learning_pattern ?? extra?.learning_pattern ?? null) as LearningPattern | null;

  const next = nextTopic(outline);
  const isDraft = j.status === "draft";
  const totalMinutes = outline.flatTopics.reduce((s, t) => s + t.estimatedMinutes, 0);
  const skippedCount = outline.flatTopics.filter((t) => t.skipped && !t.lessonCompleted).length;

  const checks = version
    ? analyzeCoverage({
        learningPattern: pattern,
        currentLevel: j.current_level,
        targetLevel: j.target_level,
        outcomes: extra?.outcomes ?? [],
        declaredPrerequisites: (extra?.prerequisites ?? []).map((p) => p.name),
        limitations: extra?.limitations ?? [],
        sourceCount: sources.length,
        modules: modules.map((m) => ({
          title: m.title,
          level: m.level,
          kind: m.kind,
          topics: m.topics.map((t) => ({
            title: t.title,
            kind: t.kind,
            objectives: t.objectives,
            prerequisites: t.prerequisites,
            hasExercise: t.has_exercise,
            isCheckpoint: t.is_checkpoint,
            safetyNote: t.safety_note,
            sourceRefCount: t.source_refs.length,
          })),
        })),
      })
    : [];
  const summary = summarizeChecks(checks);
  const review = extra?.coverage?.review ?? null;
  const reviewStale = Boolean(extra?.coverage && extra.coverage.versionModules !== undefined && extra.coverage.versionModules !== modules.length);
  const suggestions = review ? [...review.missingPrerequisites, ...review.missingSubtopics, ...review.practicalGaps] : [];
  const sourceIndex = new Map(sources.map((s, i) => [s.id, i + 1]));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/learning" className="text-sm text-muted hover:text-ink">← My Learning</Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{j.title}</h1>
          <Badge tone={j.status === "active" ? "success" : j.status === "draft" ? "accent" : "neutral"} className="capitalize">{j.status}</Badge>
          {version && <SourceBadge source={version.source} />}
          {pattern && <Badge>{PATTERN_LABEL[pattern] ?? pattern}</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted">{j.goal || j.subject}</p>
        {node && (
          <p className="mt-1 text-xs text-muted">
            Catalog topic: <Link href={`/topics/${node.id}`} className="text-primary">{node.name}</Link>
          </p>
        )}
      </div>

      {sp.genError && <Alert kind="error" title="We couldn't generate your roadmap">{sp.genError} Your answers are saved. Try again below.</Alert>}

      {!version ? (
        <EmptyState
          icon={<Compass className="size-6" />}
          title="No roadmap yet"
          description="Your journey is saved. Generate a personalised roadmap when you're ready."
          action={<GenerateCurriculumButton journeyId={j.id} />}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <div className="min-w-0 space-y-4">
            {isDraft && (
              <Card className="border-primary/30 bg-primary-soft/50">
                <h2 className="font-semibold">Preview your roadmap</h2>
                <p className="mt-1 text-sm text-muted">
                  Review the plan and its coverage summary. You can rename, reorder, add or remove topics, mark topics you already know, or expand it before you begin. A short diagnostic can tell you where to start.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <StartJourneyButton journeyId={j.id} />
                  <ButtonLink href={`/journeys/${j.id}/diagnostic`} variant="secondary" size="lg">
                    Take a diagnostic (optional)
                  </ButtonLink>
                </div>
              </Card>
            )}
            {!isDraft && next && (
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted">Up next</p>
                  <p className="truncate font-semibold">{next.title}</p>
                </div>
                <ButtonLink href={`/lesson/${next.id}`}>Continue</ButtonLink>
              </Card>
            )}

            {extra && (extra.outcomes.length > 0 || extra.prerequisites.length > 0) && (
              <Card className="grid gap-4 sm:grid-cols-2">
                {extra.outcomes.length > 0 && (
                  <div>
                    <CardTitle className="text-sm">By the end you&apos;ll be able to</CardTitle>
                    <ul className="mt-2 space-y-1 text-sm">
                      {extra.outcomes.map((o) => (
                        <li key={o} className="flex gap-2">
                          <Target aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" /> {o}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {extra.prerequisites.length > 0 && (
                  <div>
                    <CardTitle className="text-sm">Assumed background</CardTitle>
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {extra.prerequisites.map((p) => (
                        <li key={p.name}>
                          <span className="font-medium">{p.name}</span>
                          <span className="block text-xs text-muted">{p.reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            )}

            <Roadmap
              editable
              nextTopicId={next?.id ?? null}
              modules={modules.map((m) => ({
                ...m,
                topics: m.topics.map((t) => ({
                  id: t.id,
                  title: t.title,
                  summary: t.summary,
                  estimated_minutes: t.estimated_minutes,
                  is_checkpoint: t.is_checkpoint,
                  objectives: t.objectives,
                  status: t.mastery?.status ?? "not_started",
                  lessonCompleted: Boolean(t.mastery?.lesson_completed_at),
                  skipped: Boolean(t.mastery?.skipped_at),
                  kind: t.kind,
                  sourceCount: t.source_refs.length,
                  hasSafety: Boolean(t.safety_note),
                })),
              }))}
            />

            <Card id="coverage">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Curriculum coverage</CardTitle>
                  <p className="mt-1 text-xs text-muted">
                    {summary.ok} checks pass · {summary.attention} need attention · {summary.info} notes
                  </p>
                </div>
                <RunReviewButton journeyId={j.id} hasReview={Boolean(review)} />
              </div>
              <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">{SCOPE_STATEMENT}</p>
              <ul className="mt-2 divide-y divide-border">
                {checks.map((c) => (
                  <CheckRow key={c.id} c={c} />
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-muted">Rule-based checks: each compares the roadmap against a stated criterion (prerequisite order, practice share, checkpoints and so on). There&apos;s no completeness score, because no defensible method exists for an open-ended subject.</p>

              {review && (
                <div className="mt-5 border-t border-border pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">AI gap analysis</h3>
                    <Badge tone="accent">AI-generated</Badge>
                    <span className="text-xs text-muted">{formatRelative(extra?.coverage?.reviewedAt)}</span>
                    {reviewStale && <Badge tone="warn">Roadmap changed since — re-run</Badge>}
                  </div>
                  <p className="mt-2 text-sm text-muted">{review.summary}</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {REVIEW_SECTIONS.filter(([k]) => (review[k] as string[]).length > 0).map(([k, label]) => (
                      <div key={k}>
                        <p className="text-xs font-semibold">{label}</p>
                        <ul className="mt-1 list-disc pl-4 text-xs text-muted">
                          {(review[k] as string[]).map((x) => (
                            <li key={x}>{x}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  {REVIEW_SECTIONS.every(([k]) => (review[k] as string[]).length === 0) && <p className="mt-2 text-sm text-muted">No specific gaps were reported for this goal and level.</p>}
                </div>
              )}
            </Card>

            {extra && (extra.limitations.length > 0 || extra.resources.length > 0) && (
              <Card className="space-y-4">
                {extra.limitations.length > 0 && (
                  <div>
                    <CardTitle className="text-sm">Limitations of this curriculum</CardTitle>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
                      {extra.limitations.map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {extra.resources.length > 0 && (
                  <div>
                    <CardTitle className="text-sm">Suggested resources</CardTitle>
                    <ul className="mt-2 space-y-2 text-sm">
                      {extra.resources.map((r) => (
                        <li key={r.title}>
                          {r.url ? (
                            <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                              {r.title} <ExternalLink aria-hidden className="size-3" />
                            </a>
                          ) : (
                            <span className="font-medium">{r.title}</span>
                          )}
                          <span className="ml-1.5 text-xs capitalize text-muted">({r.kind})</span>
                          {r.note && <span className="block text-xs text-muted">{r.note}</span>}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[11px] text-muted">Linked items come from retrieved sources. Unlinked items are suggestions for the type of resource to look for, not specific references.</p>
                  </div>
                )}
              </Card>
            )}

            <Card>
              <CardTitle className="text-sm">Sources for this roadmap</CardTitle>
              {sources.length > 0 ? (
                <ol className="mt-2 space-y-2.5 text-sm">
                  {sources.map((s) => (
                    <li key={s.id} className="flex gap-2">
                      <span className="mt-0.5 text-xs tabular-nums text-muted">[{sourceIndex.get(s.id)}]</span>
                      <div className="min-w-0">
                        <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-start gap-1 font-medium text-primary hover:underline">
                          <span className="break-words">{s.title}</span> <ExternalLink aria-hidden className="mt-1 size-3 shrink-0" />
                        </a>
                        <p className="text-xs text-muted">
                          {s.provider}
                          {s.authors && ` · ${s.authors}`}
                          {s.published && ` · ${s.published}`} · retrieved {formatRelative(s.retrieved_at)}
                          {s.license && ` · ${s.license}`}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 text-sm text-muted">No external sources were used for this roadmap. Its structure is AI-generated and may contain mistakes.</p>
              )}
              <p className="mt-3 text-[11px] text-muted">Sources are retrieved from public references (Wikipedia, OpenAlex) when the roadmap is generated, and cited only where they relate to a topic. Explanations in lessons are written by AI.</p>
            </Card>
          </div>

          <aside className="space-y-4">
            <Card>
              <h2 className="text-sm font-semibold">Progress</h2>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {completedCount}
                <span className="text-base text-muted">/{totalCount}</span>
              </p>
              <p className="text-xs text-muted">lessons studied{skippedCount > 0 ? ` · ${skippedCount} marked as already known` : ""}</p>
              <ProgressBar value={totalCount ? completedCount / totalCount : 0} label="Lessons studied" className="mt-3" />
              <p className="mt-3 text-xs text-muted">Studying a lesson is separate from mastering it. Quizzes and reviews measure understanding.</p>
            </Card>
            <Card className="space-y-2.5 text-sm">
              <p className="flex items-center gap-2">
                <Target aria-hidden className="size-4 text-primary" /> {CURRENT_LEVEL_LABEL[j.current_level as keyof typeof CURRENT_LEVEL_LABEL]?.split(" —")[0]} → {TARGET_LEVEL_LABEL[j.target_level as keyof typeof TARGET_LEVEL_LABEL]}
              </p>
              <p className="flex items-center gap-2">
                <Clock aria-hidden className="size-4 text-primary" /> {j.minutes_per_day} min/day · {j.days_per_week} days/week · ~{Math.round(totalMinutes / 60)} h total
              </p>
              {j.deadline && <p className="text-muted">Deadline: {j.deadline}</p>}
              <p className="text-xs text-muted">Roadmap version {version.version}</p>
              {extra?.changes && extra.changes.length > 0 && (
                <ul className="border-t border-border pt-2 text-xs text-muted">
                  {extra.changes.slice(-3).map((c) => (
                    <li key={c.at}>
                      Expanded with “{c.focus}” · {formatRelative(c.at)}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="space-y-4">
              <h2 className="text-sm font-semibold">Shape your roadmap</h2>
              <ExpandCurriculumForm journeyId={j.id} suggestions={suggestions} />
              <div className="border-t border-border pt-3">
                <AdjustGoalForm journeyId={j.id} goal={j.goal} currentLevel={j.current_level} targetLevel={j.target_level} pattern={pattern} scopeNotes={jExtra?.scope_notes ?? null} />
              </div>
            </Card>
            <Card className="space-y-3">
              <h2 className="text-sm font-semibold">Journey settings</h2>
              <JourneyControls journeyId={j.id} status={j.status} />
              <GenerateCurriculumButton
                journeyId={j.id}
                variant="secondary"
                label="Regenerate roadmap"
                confirmText="Create a new version of this roadmap? Your completed lessons, quiz results and reviews are kept, and progress carries over to topics that clearly match."
              />
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}
