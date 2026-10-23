-- LearnFlow AI — universal knowledge catalog
--
-- A shared, data-driven hierarchy of knowledge (domain → discipline → subject →
-- … → concept), separate from each learner's private journeys. The catalog grows
-- at runtime (AI proposals, user suggestions, curated imports, admin edits)
-- without code changes or redeploys.
--
-- Access model:
--   * Signed-in users can READ catalog content (except rejected/merged nodes).
--   * Nobody writes through the public API: there are no insert/update/delete
--     policies. The server writes with the service role after validating input,
--     and admin actions are authorised server-side against app_admins.
--   * Learner-specific data stays in the per-user tables from the first migration.

create extension if not exists pg_trgm;

-- array_to_string is only STABLE; generated columns need an IMMUTABLE wrapper.
create or replace function public.immutable_array_to_string(arr text[], sep text)
returns text language sql immutable parallel safe as $$
  select array_to_string(arr, sep)
$$;

-- ---------------------------------------------------------------------------
-- Admins
-- ---------------------------------------------------------------------------

create table public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
create policy "app_admins_select_own" on public.app_admins for select using ((select auth.uid()) = user_id);

create or replace function public.is_catalog_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid())
$$;

-- ---------------------------------------------------------------------------
-- Knowledge nodes
-- ---------------------------------------------------------------------------

create table public.knowledge_nodes (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.knowledge_nodes (id) on delete restrict,
  domain_id uuid references public.knowledge_nodes (id) on delete set null,
  -- Human-readable, unique slug path, e.g. "natural-sciences/physics/quantum-mechanics".
  path text not null unique check (char_length(path) between 1 and 1000),
  name text not null check (char_length(name) between 1 and 200),
  -- Normalised name (computed by the server) used for duplicate detection.
  name_key text not null check (char_length(name_key) between 1 and 200),
  aliases text[] not null default '{}',
  alias_keys text[] not null default '{}',
  description text check (char_length(description) <= 4000),
  kind text not null default 'topic' check (kind in ('domain', 'discipline', 'subject', 'subdiscipline', 'topic', 'subtopic', 'concept', 'skill', 'field')),
  difficulty text check (difficulty in ('introductory', 'beginner', 'intermediate', 'advanced', 'expert')),
  learning_objectives text[] not null default '{}',
  learning_pattern text check (learning_pattern in ('conceptual', 'problem_solving', 'language', 'hands_on', 'creative', 'professional', 'physical', 'mixed')),
  icon text check (char_length(icon) <= 40),
  origin text not null check (origin in ('curated', 'imported', 'ai_generated', 'user_suggested')),
  status text not null default 'proposed' check (status in ('verified', 'reviewed', 'proposed', 'rejected', 'merged')),
  merged_into uuid references public.knowledge_nodes (id) on delete set null,
  request_count int not null default 0 check (request_count >= 0),
  created_by uuid references auth.users (id) on delete set null,
  search tsvector generated always as (
    setweight(to_tsvector('simple', name), 'A')
    || setweight(to_tsvector('simple', public.immutable_array_to_string(aliases, ' ')), 'B')
    || setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The same name may exist under different parents (Mercury the planet vs. the element),
  -- but never twice under the same parent.
  unique nulls not distinct (parent_id, name_key),
  check (id <> parent_id),
  check (merged_into is null or status = 'merged')
);

create index knowledge_nodes_search_idx on public.knowledge_nodes using gin (search);
create index knowledge_nodes_name_trgm_idx on public.knowledge_nodes using gin (lower(name) gin_trgm_ops);
create index knowledge_nodes_alias_keys_idx on public.knowledge_nodes using gin (alias_keys);
create index knowledge_nodes_parent_idx on public.knowledge_nodes (parent_id, name);
create index knowledge_nodes_domain_idx on public.knowledge_nodes (domain_id, status);
create index knowledge_nodes_review_idx on public.knowledge_nodes (status, created_at desc);
create index knowledge_nodes_name_key_idx on public.knowledge_nodes (name_key);

create trigger set_updated_at before update on public.knowledge_nodes
  for each row execute function public.set_updated_at();

-- Every node records its root domain for fast filtering; domains point at themselves via NULL.
create or replace function public.knowledge_nodes_set_domain()
returns trigger language plpgsql as $$
begin
  if new.parent_id is null then
    new.domain_id := null;
  else
    select coalesce(p.domain_id, p.id) into new.domain_id from public.knowledge_nodes p where p.id = new.parent_id;
  end if;
  return new;
end $$;

create trigger knowledge_nodes_domain
  before insert or update of parent_id on public.knowledge_nodes
  for each row execute function public.knowledge_nodes_set_domain();

-- ---------------------------------------------------------------------------
-- Relationships, sources, demand, job log
-- ---------------------------------------------------------------------------

-- (node_id, target_id, 'prerequisite') means target must be understood before node.
create table public.knowledge_edges (
  node_id uuid not null references public.knowledge_nodes (id) on delete cascade,
  target_id uuid not null references public.knowledge_nodes (id) on delete cascade,
  relation text not null check (relation in ('prerequisite', 'related')),
  note text check (char_length(note) <= 500),
  origin text not null check (origin in ('curated', 'imported', 'ai_generated', 'user_suggested')),
  created_at timestamptz not null default now(),
  primary key (node_id, target_id, relation),
  check (node_id <> target_id)
);
create index knowledge_edges_target_idx on public.knowledge_edges (target_id, relation);

-- Source metadata only: a short attributed snippet, never copied full text.
create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.knowledge_nodes (id) on delete cascade,
  url text not null check (url ~ '^https://' and char_length(url) <= 2000),
  title text not null check (char_length(title) between 1 and 500),
  provider text not null check (char_length(provider) <= 100),
  source_type text not null check (source_type in ('reference', 'academic', 'official', 'oer', 'web')),
  authors text check (char_length(authors) <= 500),
  published text check (char_length(published) <= 40),
  license text check (char_length(license) <= 200),
  snippet text check (char_length(snippet) <= 800),
  retrieved_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (node_id, url)
);

-- Aggregated, anonymous demand signal: no user ids are stored.
create table public.topic_requests (
  id bigint generated always as identity primary key,
  query_key text not null unique check (char_length(query_key) between 1 and 200),
  display_query text not null check (char_length(display_query) <= 160),
  request_count int not null default 1,
  matched_node_id uuid references public.knowledge_nodes (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'resolved', 'ignored')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index topic_requests_open_idx on public.topic_requests (status, request_count desc);

-- Observability for AI generation and source retrieval (no user ids, no free text beyond the topic).
create table public.catalog_jobs (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('interpret', 'propose', 'expand', 'curriculum', 'review', 'retrieve', 'expand_curriculum')),
  status text not null check (status in ('succeeded', 'failed')),
  topic text check (char_length(topic) <= 200),
  node_id uuid references public.knowledge_nodes (id) on delete set null,
  error_code text check (char_length(error_code) <= 60),
  duration_ms int,
  created_at timestamptz not null default now()
);
create index catalog_jobs_recent_idx on public.catalog_jobs (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security (read-only for users; writes via the service role only)
-- ---------------------------------------------------------------------------

alter table public.knowledge_nodes enable row level security;
create policy "knowledge_nodes_read" on public.knowledge_nodes for select to authenticated
  using (status not in ('rejected', 'merged') or public.is_catalog_admin());

alter table public.knowledge_edges enable row level security;
create policy "knowledge_edges_read" on public.knowledge_edges for select to authenticated using (true);

alter table public.knowledge_sources enable row level security;
create policy "knowledge_sources_read" on public.knowledge_sources for select to authenticated using (true);

alter table public.topic_requests enable row level security;
create policy "topic_requests_admin_read" on public.topic_requests for select to authenticated using (public.is_catalog_admin());

alter table public.catalog_jobs enable row level security;
create policy "catalog_jobs_admin_read" on public.catalog_jobs for select to authenticated using (public.is_catalog_admin());

-- ---------------------------------------------------------------------------
-- Search: full-text (names, aliases, descriptions) + trigram fuzzy matching.
-- Candidates come from index-backed branches, then are ranked together.
-- ---------------------------------------------------------------------------

create or replace function public.search_knowledge(
  q text,
  q_key text default null,
  max_results int default 20,
  skip int default 0,
  in_domain uuid default null
)
returns table (
  id uuid, parent_id uuid, domain_id uuid, path text, name text, aliases text[], description text,
  kind text, difficulty text, origin text, status text, request_count int, rank real
)
language sql stable security invoker set search_path = public as $$
  with input as (
    select
      lower(left(q, 200)) as lq,
      -- OR the words together for recall; rank decides relevance.
      nullif(replace(plainto_tsquery('simple', left(q, 200))::text, '&', '|'), '')::tsquery as tq_simple,
      nullif(replace(plainto_tsquery('english', left(q, 200))::text, '&', '|'), '')::tsquery as tq_english
  ),
  candidates as (
    select n.id from public.knowledge_nodes n, input i where i.tq_simple is not null and n.search @@ i.tq_simple
    union
    select n.id from public.knowledge_nodes n, input i where i.tq_english is not null and n.search @@ i.tq_english
    union
    select n.id from public.knowledge_nodes n, input i where lower(n.name) % i.lq
    union
    select n.id from public.knowledge_nodes n where q_key is not null and (n.name_key = q_key or n.alias_keys @> array[q_key])
  )
  select n.id, n.parent_id, n.domain_id, n.path, n.name, n.aliases, n.description,
         n.kind, n.difficulty, n.origin, n.status, n.request_count,
         (
           case when q_key is not null and (n.name_key = q_key or n.alias_keys @> array[q_key]) then 2.0 else 0 end
           + greatest(
               ts_rank(n.search, coalesce(i.tq_simple, ''::tsquery) || coalesce(i.tq_english, ''::tsquery)),
               similarity(lower(n.name), i.lq)
             )
           + case n.status when 'verified' then 0.15 when 'reviewed' then 0.1 else 0 end
         )::real as rank
  from candidates c
  join public.knowledge_nodes n on n.id = c.id
  cross join input i
  where n.status not in ('rejected', 'merged')
    and (in_domain is null or n.domain_id = in_domain or n.id = in_domain)
  order by rank desc, n.request_count desc, n.name
  limit least(greatest(max_results, 1), 50)
  offset greatest(skip, 0);
$$;

grant execute on function public.search_knowledge(text, text, int, int, uuid) to authenticated;

-- Ancestors for breadcrumbs (root first).
create or replace function public.knowledge_ancestors(node uuid)
returns table (id uuid, name text, depth int)
language sql stable security invoker set search_path = public as $$
  with recursive up as (
    select n.id, n.name, n.parent_id, 0 as depth from public.knowledge_nodes n where n.id = node
    union all
    select p.id, p.name, p.parent_id, up.depth + 1 from public.knowledge_nodes p join up on p.id = up.parent_id where up.depth < 20
  )
  select up.id, up.name, up.depth from up where up.id <> node order by up.depth desc;
$$;

grant execute on function public.knowledge_ancestors(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Demand tracking (service role only)
-- ---------------------------------------------------------------------------

create or replace function public.record_topic_request(p_key text, p_display text, p_node uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.topic_requests (query_key, display_query, matched_node_id, status)
  values (left(p_key, 200), left(p_display, 160), p_node, case when p_node is null then 'open' else 'resolved' end)
  on conflict (query_key) do update set
    request_count = public.topic_requests.request_count + 1,
    last_seen_at = now(),
    matched_node_id = coalesce(excluded.matched_node_id, public.topic_requests.matched_node_id),
    status = case when excluded.matched_node_id is not null then 'resolved' else public.topic_requests.status end;
  if p_node is not null then
    update public.knowledge_nodes set request_count = request_count + 1 where id = p_node;
  end if;
end $$;

revoke all on function public.record_topic_request(text, text, uuid) from public, anon, authenticated;
grant execute on function public.record_topic_request(text, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Merging duplicates (service role only; the server checks admin rights first)
-- ---------------------------------------------------------------------------

create or replace function public.merge_knowledge_nodes(p_source uuid, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_source public.knowledge_nodes;
  v_target public.knowledge_nodes;
  v_child record;
  v_existing uuid;
begin
  if p_source = p_target then raise exception 'cannot merge a node into itself'; end if;
  select * into v_source from public.knowledge_nodes where id = p_source for update;
  select * into v_target from public.knowledge_nodes where id = p_target for update;
  if v_source.id is null or v_target.id is null then raise exception 'node not found'; end if;
  if v_target.status = 'merged' then raise exception 'target is itself merged'; end if;
  -- Refuse to merge a node into its own descendant (would create a cycle).
  if exists (
    with recursive up as (
      select id, parent_id from public.knowledge_nodes where id = p_target
      union all select n.id, n.parent_id from public.knowledge_nodes n join up on n.id = up.parent_id
    ) select 1 from up where id = p_source
  ) then raise exception 'target is a descendant of source'; end if;

  -- Move children; a child that clashes by name with an existing child of the target is merged recursively.
  for v_child in select id, name_key from public.knowledge_nodes where parent_id = p_source loop
    select id into v_existing from public.knowledge_nodes where parent_id = p_target and name_key = v_child.name_key;
    if v_existing is not null then
      perform public.merge_knowledge_nodes(v_child.id, v_existing);
    else
      update public.knowledge_nodes set parent_id = p_target, path = v_target.path || '/' || v_child.name_key || '-' || left(v_child.id::text, 8)
      where id = v_child.id;
    end if;
  end loop;

  update public.knowledge_nodes set
    aliases = (select array(select distinct a from unnest(v_target.aliases || v_source.aliases || array[v_source.name]) a where lower(a) <> lower(v_target.name))),
    alias_keys = (select array(select distinct k from unnest(v_target.alias_keys || v_source.alias_keys || array[v_source.name_key]) k where k <> v_target.name_key)),
    description = coalesce(v_target.description, v_source.description),
    request_count = v_target.request_count + v_source.request_count
  where id = p_target;

  insert into public.knowledge_edges (node_id, target_id, relation, note, origin)
    select case when node_id = p_source then p_target else node_id end,
           case when target_id = p_source then p_target else target_id end,
           relation, note, origin
    from public.knowledge_edges where (node_id = p_source or target_id = p_source)
  on conflict do nothing;
  delete from public.knowledge_edges where node_id = p_source or target_id = p_source;
  delete from public.knowledge_edges where node_id = target_id;

  insert into public.knowledge_sources (node_id, url, title, provider, source_type, authors, published, license, snippet, retrieved_at)
    select p_target, url, title, provider, source_type, authors, published, license, snippet, retrieved_at
    from public.knowledge_sources where node_id = p_source
  on conflict (node_id, url) do nothing;

  update public.learning_journeys set knowledge_node_id = p_target where knowledge_node_id = p_source;
  update public.topic_requests set matched_node_id = p_target where matched_node_id = p_source;

  update public.knowledge_nodes set status = 'merged', merged_into = p_target, name_key = name_key || '~merged~' || left(id::text, 8)
  where id = p_source;
end $$;

revoke all on function public.merge_knowledge_nodes(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_knowledge_nodes(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Link journeys to the catalog; richer curriculum metadata
-- ---------------------------------------------------------------------------

alter table public.learning_journeys
  add column knowledge_node_id uuid references public.knowledge_nodes (id) on delete set null,
  add column learning_pattern text check (learning_pattern in ('conceptual', 'problem_solving', 'language', 'hands_on', 'creative', 'professional', 'physical', 'mixed')),
  add column scope_notes text check (char_length(scope_notes) <= 1000);
create index learning_journeys_node_idx on public.learning_journeys (knowledge_node_id);

alter table public.curriculum_versions
  add column learning_pattern text,
  add column outcomes text[] not null default '{}',
  add column prerequisites jsonb not null default '[]',
  add column resources jsonb not null default '[]',
  add column limitations text[] not null default '{}',
  add column coverage jsonb,
  add column changes jsonb not null default '[]';

alter table public.learning_modules
  add column kind text not null default 'core' check (kind in ('prerequisites', 'foundations', 'core', 'advanced', 'specialization', 'practice', 'project'));

alter table public.learning_topics
  add column kind text not null default 'concept' check (kind in ('concept', 'skill_practice', 'project', 'assessment', 'review')),
  add column source_refs uuid[] not null default '{}',
  add column safety_note text check (char_length(safety_note) <= 600);

alter table public.topic_mastery
  add column skipped_at timestamptz;

-- Sources retrieved for a learner's curriculum version (private to that learner).
create table public.curriculum_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  version_id uuid not null,
  url text not null check (url ~ '^https://' and char_length(url) <= 2000),
  title text not null check (char_length(title) between 1 and 500),
  provider text not null check (char_length(provider) <= 100),
  source_type text not null check (source_type in ('reference', 'academic', 'official', 'oer', 'web')),
  authors text check (char_length(authors) <= 500),
  published text check (char_length(published) <= 40),
  license text check (char_length(license) <= 200),
  snippet text check (char_length(snippet) <= 800),
  retrieved_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (version_id, url),
  foreign key (version_id, user_id) references public.curriculum_versions (id, user_id) on delete cascade
);
create index curriculum_sources_version_idx on public.curriculum_sources (version_id);

alter table public.curriculum_sources enable row level security;
create policy "curriculum_sources_owner_all" on public.curriculum_sources for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
