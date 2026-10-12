-- 1% Better per Day — cloud sync schema (ARCHITECTURE v2.1 §4.3, M6-T4).
-- Run once on the Supabase project (Dashboard → SQL Editor → New query → paste → Run),
-- or locally with `npm run db:start` / `npm run db:reset` (Docker).
--
-- Security model (NFR-05, FR-43): Row Level Security on every table, policies for the
-- `authenticated` role only, no DELETE policy (clients soft-delete via deleted_at),
-- explicit grants with nothing for `anon`, and triggers that force user_id = auth.uid().

-- Goals and entries per user. Mirrors the local model + sync columns.
create table public.goals (
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id                text not null check (char_length(id) between 1 and 64),  -- local id (UUID or id from an old backup file)
  name              text not null check (char_length(name) between 1 and 60),
  why               text not null default '' check (char_length(why) <= 280),
  target_type       text not null check (target_type in ('daily', 'total')),
  target_minutes    integer not null check (target_minutes between 1 and 600000),
  start_date        date not null,
  end_date          date not null check (end_date >= start_date),
  archived          boolean not null default false,
  created_at        timestamptz not null,
  updated_at        timestamptz not null,
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create table public.entries (
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id                text not null check (char_length(id) between 1 and 64),
  goal_id           text not null check (char_length(goal_id) between 1 and 64),  -- no FK (ADR-20)
  date              date not null,
  minutes           integer not null check (minutes between 1 and 1440),
  note              text not null default '' check (char_length(note) <= 280),
  source            text not null check (source in ('manual', 'timer')),
  created_at        timestamptz not null,
  updated_at        timestamptz not null,
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create index goals_pull_idx   on public.goals   (user_id, server_updated_at, id);
create index entries_pull_idx on public.entries (user_id, server_updated_at, id);

-- Last-write-wins + server cursor (ADR-21). Runs for plain INSERT, UPDATE and upsert (ON CONFLICT DO UPDATE).
create or replace function public.sync_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.updated_at <= old.updated_at then
      return null;                         -- incoming is older or equal: keep the server row (tie -> server)
    end if;
    new.user_id    := old.user_id;         -- owner and creation time never change
    new.created_at := old.created_at;
  else
    new.user_id := auth.uid();             -- never trust client-sent owner on insert
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end $$;

create trigger goals_sync_before_write   before insert or update on public.goals
  for each row execute function public.sync_before_write();
create trigger entries_sync_before_write before insert or update on public.entries
  for each row execute function public.sync_before_write();

alter table public.goals   enable row level security;
alter table public.entries enable row level security;

create policy goals_select_own on public.goals for select to authenticated
  using ((select auth.uid()) = user_id);
create policy goals_insert_own on public.goals for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy goals_update_own on public.goals for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy entries_select_own on public.entries for select to authenticated
  using ((select auth.uid()) = user_id);
create policy entries_insert_own on public.entries for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy entries_update_own on public.entries for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- No DELETE policy: clients only soft-delete (deleted_at). Hard delete = Dashboard (OQ-09).

-- Explicit Data API grants (Supabase no longer auto-exposes new public tables; applied to all projects from 2026-10-30).
revoke all on public.goals, public.entries from anon, authenticated;
grant select, insert, update on public.goals, public.entries to authenticated;

-- v2.1: synced user preferences (FR-55). One row per user, two independent LWW groups.
create table public.settings (
  user_id             uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  reminder_enabled    boolean,
  reminder_time       text check (reminder_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  reminder_updated_at timestamptz,
  locale              text check (locale in ('en', 'vi')),
  locale_updated_at   timestamptz,
  server_updated_at   timestamptz not null default clock_timestamp(),
  -- a group is either fully set or fully empty
  check ((reminder_enabled is null) = (reminder_time is null)
     and (reminder_enabled is null) = (reminder_updated_at is null)),
  check ((locale is null) = (locale_updated_at is null))
);

create or replace function public.settings_before_write() returns trigger
language plpgsql set search_path = '' as $$
declare
  changed boolean := false;
begin
  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
    new.server_updated_at := clock_timestamp();
    return new;
  end if;
  new.user_id := old.user_id;
  -- reminder group: take incoming only if strictly newer (tie -> server)
  if new.reminder_updated_at is not null
     and (old.reminder_updated_at is null or new.reminder_updated_at > old.reminder_updated_at) then
    changed := true;
  else
    new.reminder_enabled := old.reminder_enabled;
    new.reminder_time := old.reminder_time;
    new.reminder_updated_at := old.reminder_updated_at;
  end if;
  -- locale group
  if new.locale_updated_at is not null
     and (old.locale_updated_at is null or new.locale_updated_at > old.locale_updated_at) then
    changed := true;
  else
    new.locale := old.locale;
    new.locale_updated_at := old.locale_updated_at;
  end if;
  if not changed then
    return null;                                   -- nothing newer: keep the row untouched
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end $$;

create trigger settings_before_write before insert or update on public.settings
  for each row execute function public.settings_before_write();

alter table public.settings enable row level security;
create policy settings_select_own on public.settings for select to authenticated
  using ((select auth.uid()) = user_id);
create policy settings_insert_own on public.settings for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy settings_update_own on public.settings for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.settings from anon, authenticated;
grant select, insert, update on public.settings to authenticated;
