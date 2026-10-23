-- LearnFlow AI — initial schema
-- Every user-owned table carries user_id and has Row Level Security enabled.
-- Child tables use composite foreign keys (parent_id, user_id) so a row can only
-- ever point at a parent owned by the same user, enforced by the database itself.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles & preferences
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  timezone text not null default 'UTC' check (char_length(timezone) <= 64),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  learning_styles text[] not null default '{examples,reading}',
  explanation_language text not null default 'en' check (explanation_language in ('en', 'hinglish')),
  max_daily_reviews int not null default 20 check (max_daily_reviews between 5 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.daily_goals (
  user_id uuid primary key references auth.users (id) on delete cascade,
  minutes_target int not null default 20 check (minutes_target between 5 and 240),
  activities_target int not null default 2 check (activities_target between 1 and 20),
  days_per_week int not null default 5 check (days_per_week between 1 and 7),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  study_reminders boolean not null default false,
  reminder_time time not null default '19:00',
  review_reminders boolean not null default false,
  weekly_summary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Journeys & curriculum
-- ---------------------------------------------------------------------------

create table public.learning_journeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  subject text not null check (char_length(subject) between 1 and 160),
  goal text check (char_length(goal) <= 1000),
  motivation text check (char_length(motivation) <= 1000),
  current_level text not null default 'none' check (current_level in ('none', 'beginner', 'intermediate', 'advanced')),
  target_level text not null default 'intermediate' check (target_level in ('beginner', 'intermediate', 'advanced', 'expert')),
  minutes_per_day int not null default 20 check (minutes_per_day between 5 and 240),
  days_per_week int not null default 5 check (days_per_week between 1 and 7),
  learning_styles text[] not null default '{}',
  deadline date,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed', 'archived')),
  active_version_id uuid,
  last_topic_id uuid,
  last_studied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index learning_journeys_user_idx on public.learning_journeys (user_id, updated_at desc);

create table public.curriculum_versions (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  version int not null,
  source text not null check (source in ('ai', 'demo')),
  model text,
  summary text,
  created_at timestamptz not null default now(),
  unique (journey_id, version),
  unique (id, user_id),
  foreign key (journey_id, user_id) references public.learning_journeys (id, user_id) on delete cascade
);

alter table public.learning_journeys
  add constraint learning_journeys_active_version_fk
  foreign key (active_version_id) references public.curriculum_versions (id) on delete set null;

create table public.learning_modules (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null,
  journey_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  position int not null,
  level text not null check (level in ('beginner', 'intermediate', 'advanced', 'expert')),
  title text not null check (char_length(title) between 1 and 200),
  description text,
  milestone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (version_id, user_id) references public.curriculum_versions (id, user_id) on delete cascade
);
create index learning_modules_version_idx on public.learning_modules (version_id, position);

create table public.learning_topics (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null,
  version_id uuid not null,
  journey_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  position int not null,
  topic_key text not null,
  title text not null check (char_length(title) between 1 and 200),
  summary text,
  objectives text[] not null default '{}',
  prerequisites text[] not null default '{}',
  estimated_minutes int not null default 15 check (estimated_minutes between 3 and 240),
  has_exercise boolean not null default true,
  is_checkpoint boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (module_id, user_id) references public.learning_modules (id, user_id) on delete cascade
);
create index learning_topics_module_idx on public.learning_topics (module_id, position);
create index learning_topics_journey_idx on public.learning_topics (journey_id, user_id);

alter table public.learning_journeys
  add constraint learning_journeys_last_topic_fk
  foreign key (last_topic_id) references public.learning_topics (id) on delete set null;

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  variant text not null default 'standard' check (variant in ('standard', 'simpler')),
  content jsonb not null,
  source text not null check (source in ('ai', 'demo')),
  model text,
  created_at timestamptz not null default now(),
  unique (topic_id, variant),
  foreign key (topic_id, user_id) references public.learning_topics (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Activity & history
-- ---------------------------------------------------------------------------

create table public.lesson_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  topic_id uuid not null,
  journey_id uuid not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_seconds int not null default 0 check (duration_seconds between 0 and 86400),
  confidence smallint check (confidence between 1 and 5),
  foreign key (topic_id, user_id) references public.learning_topics (id, user_id) on delete cascade
);
create index lesson_sessions_user_idx on public.lesson_sessions (user_id, started_at desc);

create table public.learning_events (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  journey_id uuid references public.learning_journeys (id) on delete set null,
  topic_id uuid references public.learning_topics (id) on delete set null,
  event_type text not null check (event_type in ('lesson_started', 'lesson_completed', 'quiz_submitted', 'review_completed', 'tutor_message', 'study_time')),
  minutes numeric(6, 2) not null default 0 check (minutes between 0 and 240),
  local_date date not null,
  payload jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);
create index learning_events_user_idx on public.learning_events (user_id, occurred_at desc);

create table public.daily_activity (
  user_id uuid not null references auth.users (id) on delete cascade,
  local_date date not null,
  minutes numeric(7, 2) not null default 0,
  lessons_completed int not null default 0,
  quizzes_completed int not null default 0,
  reviews_completed int not null default 0,
  events_count int not null default 0,
  primary key (user_id, local_date)
);

-- ---------------------------------------------------------------------------
-- Assessments
-- ---------------------------------------------------------------------------

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  journey_id uuid not null,
  topic_id uuid references public.learning_topics (id) on delete cascade,
  kind text not null check (kind in ('quiz', 'diagnostic', 'practice')),
  difficulty text not null default 'standard' check (difficulty in ('easier', 'standard', 'harder')),
  source text not null check (source in ('ai', 'demo')),
  model text,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (journey_id, user_id) references public.learning_journeys (id, user_id) on delete cascade
);
create index assessments_topic_idx on public.assessments (user_id, topic_id, created_at desc);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  position int not null,
  prompt text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array'),
  correct_index int not null check (correct_index >= 0),
  explanation text,
  concept text,
  foreign key (assessment_id, user_id) references public.assessments (id, user_id) on delete cascade
);
create index questions_assessment_idx on public.questions (assessment_id, position);

create table public.assessment_attempts (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  assessment_id uuid not null,
  journey_id uuid not null,
  topic_id uuid references public.learning_topics (id) on delete set null,
  correct int not null check (correct >= 0),
  total int not null check (total > 0),
  score numeric(5, 4) not null check (score between 0 and 1),
  answers jsonb not null default '[]',
  submitted_at timestamptz not null default now(),
  foreign key (assessment_id, user_id) references public.assessments (id, user_id) on delete cascade
);
create index assessment_attempts_user_idx on public.assessment_attempts (user_id, submitted_at desc);

create table public.topic_mastery (
  user_id uuid not null references auth.users (id) on delete cascade,
  topic_id uuid not null,
  journey_id uuid not null,
  mastery numeric(4, 3) not null default 0 check (mastery between 0 and 1),
  quiz_ema numeric(4, 3),
  recall_ema numeric(4, 3),
  confidence smallint check (confidence between 1 and 5),
  quiz_attempts int not null default 0,
  best_score numeric(5, 4),
  last_score numeric(5, 4),
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'needs_practice', 'developing', 'proficient', 'mastered')),
  lesson_completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, topic_id),
  foreign key (topic_id, user_id) references public.learning_topics (id, user_id) on delete cascade
);
create index topic_mastery_journey_idx on public.topic_mastery (user_id, journey_id);

-- ---------------------------------------------------------------------------
-- Spaced repetition
-- ---------------------------------------------------------------------------

create table public.review_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  journey_id uuid references public.learning_journeys (id) on delete cascade,
  topic_id uuid references public.learning_topics (id) on delete set null,
  kind text not null check (kind in ('topic', 'flashcard', 'mistake')),
  front text not null check (char_length(front) between 1 and 2000),
  back text not null check (char_length(back) between 1 and 4000),
  source text not null default 'system' check (source in ('ai', 'demo', 'user', 'system')),
  interval_days int not null default 0 check (interval_days between 0 and 3650),
  ease numeric(4, 2) not null default 2.5,
  repetitions int not null default 0,
  lapses int not null default 0,
  due_date date not null,
  last_reviewed_at timestamptz,
  suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index review_items_due_idx on public.review_items (user_id, due_date) where not suspended;

create table public.review_attempts (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  review_item_id uuid not null,
  rating text not null check (rating in ('again', 'hard', 'good', 'easy')),
  prev_interval int not null,
  new_interval int not null,
  local_date date not null,
  reviewed_at timestamptz not null default now(),
  foreign key (review_item_id, user_id) references public.review_items (id, user_id) on delete cascade
);
create index review_attempts_user_idx on public.review_attempts (user_id, reviewed_at desc);

-- ---------------------------------------------------------------------------
-- Notes, bookmarks, tutor
-- ---------------------------------------------------------------------------

create table public.user_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  journey_id uuid references public.learning_journeys (id) on delete cascade,
  topic_id uuid references public.learning_topics (id) on delete set null,
  body text not null check (char_length(body) between 1 and 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index user_notes_user_idx on public.user_notes (user_id, updated_at desc);

create table public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  topic_id uuid not null,
  journey_id uuid references public.learning_journeys (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, topic_id),
  foreign key (topic_id, user_id) references public.learning_topics (id, user_id) on delete cascade
);

create table public.tutor_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  journey_id uuid references public.learning_journeys (id) on delete cascade,
  topic_id uuid references public.learning_topics (id) on delete set null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 20000),
  created_at timestamptz not null default now()
);
create index tutor_messages_user_idx on public.tutor_messages (user_id, journey_id, created_at desc);

-- Used for per-user AI rate limiting across serverless instances.
create table public.ai_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now()
);
create index ai_requests_user_idx on public.ai_requests (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'user_preferences', 'daily_goals', 'notification_preferences',
    'learning_journeys', 'learning_modules', 'learning_topics', 'review_items', 'user_notes'
  ] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select using ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles for insert with check ((select auth.uid()) = id);

do $$
declare t text;
begin
  foreach t in array array[
    'user_preferences', 'daily_goals', 'notification_preferences', 'learning_journeys',
    'curriculum_versions', 'learning_modules', 'learning_topics', 'lessons', 'lesson_sessions',
    'learning_events', 'daily_activity', 'assessments', 'questions', 'assessment_attempts',
    'topic_mastery', 'review_items', 'review_attempts', 'user_notes', 'bookmarks', 'tutor_messages'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s_owner_all" on public.%I for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t, t);
  end loop;
end $$;

-- AI request log: users may record and count their own requests, never edit or delete them.
alter table public.ai_requests enable row level security;
create policy "ai_requests_select_own" on public.ai_requests for select using ((select auth.uid()) = user_id);
create policy "ai_requests_insert_own" on public.ai_requests for insert with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- New-user bootstrap
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80), ''))
  on conflict (id) do nothing;
  insert into public.user_preferences (user_id) values (new.id) on conflict do nothing;
  insert into public.daily_goals (user_id) values (new.id) on conflict do nothing;
  insert into public.notification_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Idempotent activity recording
-- A client-generated event id makes retries (offline queue, double taps,
-- network replays) safe: the daily rollup only changes when the event is new.
-- ---------------------------------------------------------------------------

create or replace function public.record_learning_event(
  p_event_id uuid,
  p_event_type text,
  p_local_date date,
  p_journey_id uuid default null,
  p_topic_id uuid default null,
  p_minutes numeric default 0,
  p_payload jsonb default '{}'
) returns boolean
language plpgsql security invoker set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_minutes numeric := least(greatest(coalesce(p_minutes, 0), 0), 240);
  v_rows int;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.learning_events (id, user_id, journey_id, topic_id, event_type, minutes, local_date, payload)
  values (p_event_id, v_uid, p_journey_id, p_topic_id, p_event_type, v_minutes, p_local_date, coalesce(p_payload, '{}'))
  on conflict (id) do nothing;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return false;
  end if;

  insert into public.daily_activity as d (user_id, local_date, minutes, lessons_completed, quizzes_completed, reviews_completed, events_count)
  values (
    v_uid, p_local_date, v_minutes,
    (p_event_type = 'lesson_completed')::int,
    (p_event_type = 'quiz_submitted')::int,
    (p_event_type = 'review_completed')::int,
    1
  )
  on conflict (user_id, local_date) do update set
    minutes = d.minutes + excluded.minutes,
    lessons_completed = d.lessons_completed + excluded.lessons_completed,
    quizzes_completed = d.quizzes_completed + excluded.quizzes_completed,
    reviews_completed = d.reviews_completed + excluded.reviews_completed,
    events_count = d.events_count + 1;

  return true;
end $$;

revoke all on function public.record_learning_event(uuid, text, date, uuid, uuid, numeric, jsonb) from public, anon;
grant execute on function public.record_learning_event(uuid, text, date, uuid, uuid, numeric, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Self-service account deletion (no service-role key needed).
-- Deleting the auth user cascades to every user-owned row above.
-- ---------------------------------------------------------------------------

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from auth.users where id = v_uid;
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
