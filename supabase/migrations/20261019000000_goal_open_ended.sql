-- 1% Better per Day — v4.0 (M11): open-ended goals (ARCHITECTURE v4.0 §4.6 f, ADR-33; PRD FR-43 v4.0, FR-57).
-- Run ONCE on the Supabase project, AFTER 20261012000000_cloud_sync.sql and BEFORE deploying the M11 build
-- (Dashboard → SQL Editor → New query → paste → Run; TASKS "User setup" U12), or locally with
-- `npm run db:reset` (Docker), which applies every file in this folder in order.
--
-- What changes: `goals.end_date` may be NULL, meaning "no end date" — allowed only for daily goals
-- (`target_type = 'daily'`). Existing rows keep their end_date. RLS, policies, grants and the
-- sync_before_write trigger are NOT touched.
--
-- Idempotent: running it a second time is harmless (drop not null on a nullable column is a no-op,
-- every constraint is dropped `if exists` before it is added again).
--
-- Rollback (by hand, only if no row has end_date NULL any more — otherwise `set not null` fails):
--   alter table public.goals drop constraint if exists goals_open_ended_daily_check;
--   alter table public.goals drop constraint if exists goals_period_check;
--   alter table public.goals alter column end_date set not null;
--   alter table public.goals add constraint goals_period_check check (end_date >= start_date);

alter table public.goals alter column end_date drop not null;

-- Drop the unnamed M6 check "end_date >= start_date", whatever name Postgres generated for it
-- (usually goals_check). The two named constraints below are left alone so a re-run is clean.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.goals'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%end_date >= start_date%'
      and conname not in ('goals_period_check', 'goals_open_ended_daily_check')
  loop
    execute format('alter table public.goals drop constraint %I', c.conname);
  end loop;
end $$;

-- goals_period_check: a goal with an end date still ends on or after it starts (NULL = no end date).
alter table public.goals drop constraint if exists goals_period_check;
alter table public.goals add constraint goals_period_check
  check (end_date is null or end_date >= start_date);

-- goals_open_ended_daily_check: only daily goals may have no end date (a total goal needs a period).
alter table public.goals drop constraint if exists goals_open_ended_daily_check;
alter table public.goals add constraint goals_open_ended_daily_check
  check (end_date is not null or target_type = 'daily');

-- Verify (SQL Editor): both constraints present, the column nullable, row count unchanged.
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.goals'::regclass and contype = 'c';
