-- LearnFlow AI — authentication and database roles on Neon.
--
-- All data, including user accounts and sessions, lives in this Neon database.
-- Application queries for a signed-in user run as the restricted `authenticated`
-- role with `app.user_id` set per transaction; auth.uid() exposes that id to the
-- Row Level Security policies defined in later migrations.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  -- The application's database user must be able to SET ROLE to the scoped roles.
  execute format('grant anon, authenticated to %I with set true', current_user);
end $$;

create schema if not exists auth;
revoke all on schema auth from public;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and char_length(email) between 3 and 254),
  -- scrypt$N$r$p$salt$hash (never a plain password)
  password_hash text not null check (password_hash like 'scrypt$%'),
  raw_user_meta_data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);

-- Session ids are SHA-256 hashes of the random cookie token, so a database leak
-- doesn't reveal usable session cookies.
create table if not exists auth.sessions (
  id text primary key check (char_length(id) = 64),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  user_agent text check (char_length(user_agent) <= 300)
);
create index if not exists auth_sessions_user_idx on auth.sessions (user_id);
create index if not exists auth_sessions_expiry_idx on auth.sessions (expires_at);

create table if not exists auth.password_resets (
  token_hash text primary key check (char_length(token_hash) = 64),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

-- Sliding-window counter for sign-in / sign-up attempts (brute-force protection).
create table if not exists auth.attempts (
  id bigint generated always as identity primary key,
  key text not null check (char_length(key) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists auth_attempts_key_idx on auth.attempts (key, created_at desc);

-- None of the auth tables are granted to anon/authenticated: only the server's
-- owner connection can read password hashes or sessions.

create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;
