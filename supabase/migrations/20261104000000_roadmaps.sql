-- 1% Better per Day — v8.0 (M18): big goals / roadmaps (ARCHITECTURE v8.1 §4.8 g, ADR-50/52; PRD FR-78, FR-79).
-- Run ONCE on the Supabase project, AFTER 20261012000000_cloud_sync.sql and 20261019000000_goal_open_ended.sql and
-- BEFORE deploying the M18 build (Dashboard → SQL Editor → New query → paste → Run; TASKS "User setup phase 8" U31),
-- or locally with `npm run db:reset` (Docker), which applies every file in this folder in order.
--
-- What it adds: four tables mirroring the local roadmap model (roadmaps → phases → items, checkpoints) with the same
-- sync columns, last-write-wins trigger (the existing public.sync_before_write — NOT redefined here), pull index, RLS,
-- the three policies select/insert/update for `authenticated` and explicit grants (nothing for `anon`, no DELETE:
-- clients soft-delete through deleted_at). goals, entries and settings are NOT touched.
--
-- Idempotent: `create table if not exists`, `create index if not exists`, `drop trigger/policy if exists` before each
-- `create`, and revoke/grant are repeatable — running it a second time must succeed without changes (U31 does so).
--
-- Until this file has run, the app keeps working: the sync engine treats 404 PGRST205 / 42P01 and 403 42501 on these
-- four tables as "not migrated yet" (ADR-52) — goals and entries sync as before, roadmap rows wait on the device and
-- the Account card shows the "Big goals can't sync yet" line.

-- ---- roadmaps ----
create table if not exists public.roadmaps (
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id                    text not null check (char_length(id) between 1 and 64),
  title                 text not null check (char_length(title) between 1 and 80),
  note                  text not null default '' check (char_length(note) <= 2000),
  goal_id               text check (goal_id is null or char_length(goal_id) between 1 and 64),  -- no FK (ADR-20)
  weekly_target_minutes integer check (weekly_target_minutes is null or weekly_target_minutes between 30 and 10080),
  milestone_label       text not null default '' check (char_length(milestone_label) <= 40),
  milestone_date        date,
  created_at            timestamptz not null,
  updated_at            timestamptz not null,
  deleted_at            timestamptz,
  server_updated_at     timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

-- ---- roadmap_phases ----
create table if not exists public.roadmap_phases (
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id                text not null check (char_length(id) between 1 and 64),
  roadmap_id        text not null check (char_length(roadmap_id) between 1 and 64),
  title             text not null check (char_length(title) between 1 and 80),
  note              text not null default '' check (char_length(note) <= 120),
  position          double precision not null check (position = position and abs(position) < 1e15),  -- no NaN / infinity
  created_at        timestamptz not null,
  updated_at        timestamptz not null,
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

-- ---- roadmap_items ----
create table if not exists public.roadmap_items (
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id                text not null check (char_length(id) between 1 and 64),
  roadmap_id        text not null check (char_length(roadmap_id) between 1 and 64),
  phase_id          text not null check (char_length(phase_id) between 1 and 64),
  title             text not null check (char_length(title) between 1 and 200),
  note              text not null default '' check (char_length(note) <= 1000),
  position          double precision not null check (position = position and abs(position) < 1e15),
  planned_start     date not null,
  planned_end       date not null,
  actual_start      date,
  actual_end        date,
  created_at        timestamptz not null,
  updated_at        timestamptz not null,
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint roadmap_items_planned_check check (planned_end >= planned_start and planned_end - planned_start <= 365),
  constraint roadmap_items_actual_check check (actual_start is null or actual_end is null or actual_end >= actual_start),
  primary key (user_id, id)
);

-- ---- roadmap_checkpoints ----
create table if not exists public.roadmap_checkpoints (
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id                text not null check (char_length(id) between 1 and 64),
  roadmap_id        text not null check (char_length(roadmap_id) between 1 and 64),
  title             text not null check (char_length(title) between 1 and 80),
  note              text not null default '' check (char_length(note) <= 280),
  date              date not null,
  max_score         numeric(7,1) not null check (max_score > 0 and max_score <= 10000),
  threshold         numeric(7,1) check (threshold is null or (threshold >= 0 and threshold <= max_score)),
  score             numeric(7,1) check (score is null or (score >= 0 and score <= max_score)),
  created_at        timestamptz not null,
  updated_at        timestamptz not null,
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

-- ---- pull index (keyset: server_updated_at, id) ----
create index if not exists roadmaps_pull_idx            on public.roadmaps            (user_id, server_updated_at, id);
create index if not exists roadmap_phases_pull_idx      on public.roadmap_phases      (user_id, server_updated_at, id);
create index if not exists roadmap_items_pull_idx       on public.roadmap_items       (user_id, server_updated_at, id);
create index if not exists roadmap_checkpoints_pull_idx on public.roadmap_checkpoints (user_id, server_updated_at, id);

-- ---- last-write-wins + server cursor: the M6 function, reused as is (ADR-21) ----
drop trigger if exists roadmaps_sync_before_write on public.roadmaps;
create trigger roadmaps_sync_before_write before insert or update on public.roadmaps
  for each row execute function public.sync_before_write();
drop trigger if exists roadmap_phases_sync_before_write on public.roadmap_phases;
create trigger roadmap_phases_sync_before_write before insert or update on public.roadmap_phases
  for each row execute function public.sync_before_write();
drop trigger if exists roadmap_items_sync_before_write on public.roadmap_items;
create trigger roadmap_items_sync_before_write before insert or update on public.roadmap_items
  for each row execute function public.sync_before_write();
drop trigger if exists roadmap_checkpoints_sync_before_write on public.roadmap_checkpoints;
create trigger roadmap_checkpoints_sync_before_write before insert or update on public.roadmap_checkpoints
  for each row execute function public.sync_before_write();

-- ---- row level security: own rows only, no DELETE policy ----
alter table public.roadmaps            enable row level security;
alter table public.roadmap_phases      enable row level security;
alter table public.roadmap_items       enable row level security;
alter table public.roadmap_checkpoints enable row level security;

drop policy if exists roadmaps_select_own on public.roadmaps;
create policy roadmaps_select_own on public.roadmaps for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists roadmaps_insert_own on public.roadmaps;
create policy roadmaps_insert_own on public.roadmaps for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists roadmaps_update_own on public.roadmaps;
create policy roadmaps_update_own on public.roadmaps for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists roadmap_phases_select_own on public.roadmap_phases;
create policy roadmap_phases_select_own on public.roadmap_phases for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists roadmap_phases_insert_own on public.roadmap_phases;
create policy roadmap_phases_insert_own on public.roadmap_phases for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists roadmap_phases_update_own on public.roadmap_phases;
create policy roadmap_phases_update_own on public.roadmap_phases for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists roadmap_items_select_own on public.roadmap_items;
create policy roadmap_items_select_own on public.roadmap_items for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists roadmap_items_insert_own on public.roadmap_items;
create policy roadmap_items_insert_own on public.roadmap_items for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists roadmap_items_update_own on public.roadmap_items;
create policy roadmap_items_update_own on public.roadmap_items for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists roadmap_checkpoints_select_own on public.roadmap_checkpoints;
create policy roadmap_checkpoints_select_own on public.roadmap_checkpoints for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists roadmap_checkpoints_insert_own on public.roadmap_checkpoints;
create policy roadmap_checkpoints_insert_own on public.roadmap_checkpoints for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists roadmap_checkpoints_update_own on public.roadmap_checkpoints;
create policy roadmap_checkpoints_update_own on public.roadmap_checkpoints for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- No DELETE policy: clients only soft-delete (deleted_at). Hard delete = Dashboard (OQ-09).

-- ---- Data API grants: nothing for anon, no delete (Supabase no longer auto-exposes new public tables) ----
revoke all on public.roadmaps, public.roadmap_phases, public.roadmap_items, public.roadmap_checkpoints from anon, authenticated;
grant select, insert, update on public.roadmaps, public.roadmap_phases, public.roadmap_items, public.roadmap_checkpoints to authenticated;

-- Verify (SQL Editor): four tables with RLS on, three policies each, one trigger each, one pull index each.
--   select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename like 'roadmap%';
--   select tablename, policyname, cmd from pg_policies where schemaname = 'public' and tablename like 'roadmap%' order by 1, 2;
--   select tgname from pg_trigger where tgname like 'roadmap%_sync_before_write';
