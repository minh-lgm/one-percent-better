// Static checks on the v8.0 migration (M18-AC6, FR-79, ARCHITECTURE §4.8 g, §8 "Tĩnh (SQL)"). Always runs in
// `npm test`; the behavioural tests on a real Postgres live in tests/db/roadmaps.test.ts (`npm run test:db`, Docker).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CHECKPOINT_NOTE_MAX,
  CHECKPOINT_SCORE_MAX,
  CHECKPOINT_TITLE_MAX,
  ID_MAX,
  ITEM_NOTE_MAX,
  ITEM_SPAN_MAX_DAYS,
  ITEM_TITLE_MAX,
  PHASE_NOTE_MAX,
  PHASE_TITLE_MAX,
  ROADMAP_MILESTONE_LABEL_MAX,
  ROADMAP_NOTE_MAX,
  ROADMAP_TITLE_MAX,
  WEEKLY_TARGET_MAX,
  WEEKLY_TARGET_MIN,
} from '../config/constants';

const path = (name: string) => fileURLToPath(new URL(`../../supabase/migrations/${name}`, import.meta.url));
const read = (name: string) => readFileSync(path(name), 'utf8').replace(/\r\n/g, '\n');
/** Strip `-- comments` so prose cannot satisfy or trip the assertions. */
function stripComments(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

const SQL3 = '20261104000000_roadmaps.sql';
const sql = read(SQL3);
const code = stripComments(sql);
const TABLES = ['roadmaps', 'roadmap_phases', 'roadmap_items', 'roadmap_checkpoints'] as const;

describe('supabase/migrations/20261104000000_roadmaps.sql (M18-AC6)', () => {
  it('exists with a 14-digit name after the two earlier files, which are byte-for-byte what the project already ran', () => {
    expect(path(SQL3)).toMatch(/[\\/]20261104000000_roadmaps\.sql$/);
    expect('20261019000000' < '20261104000000').toBe(true);
    // sha256 at 2a632ca (M6 file) and at 1fb3baf (M11 file): history is never rewritten.
    expect(createHash('sha256').update(read('20261012000000_cloud_sync.sql')).digest('hex')).toBe('68927c4ce41abc28ddb36fa33080dbd3e7b7b4e03034315fc01c51e5afdb40c8');
    expect(createHash('sha256').update(read('20261019000000_goal_open_ended.sql')).digest('hex')).toBe('b4dd57458ba4aef7011f5db2144d5036367370897fc26261cd263c283153ab10');
  });

  it('creates the four tables idempotently, each with user_id → auth.users cascade, primary key (user_id, id) and the sync columns', () => {
    for (const t of TABLES) {
      expect(code, t).toContain(`create table if not exists public.${t} (`);
      const def = code.slice(code.indexOf(`create table if not exists public.${t} (`), code.indexOf('primary key (user_id, id) );', code.indexOf(`create table if not exists public.${t} (`)));
      expect(def, t).toContain('user_id uuid not null default auth.uid() references auth.users (id) on delete cascade');
      expect(def, t).toContain(`id text not null check (char_length(id) between 1 and ${ID_MAX})`);
      expect(def, t).toContain('created_at timestamptz not null');
      expect(def, t).toContain('updated_at timestamptz not null');
      expect(def, t).toContain('deleted_at timestamptz');
      expect(def, t).toContain('server_updated_at timestamptz not null default clock_timestamp()');
    }
    expect(code.match(/create table if not exists/g)).toHaveLength(4);
    expect(code).not.toMatch(/create table public\./);
  });

  it('mirrors config/constants.ts: lengths, ranges and date checks of ARCH §4.8 g', () => {
    expect(code).toContain(`title text not null check (char_length(title) between 1 and ${ROADMAP_TITLE_MAX})`);
    expect(code).toContain(`note text not null default '' check (char_length(note) <= ${ROADMAP_NOTE_MAX})`);
    expect(code).toContain(`goal_id text check (goal_id is null or char_length(goal_id) between 1 and ${ID_MAX})`);
    expect(code).toContain(`weekly_target_minutes integer check (weekly_target_minutes is null or weekly_target_minutes between ${WEEKLY_TARGET_MIN} and ${WEEKLY_TARGET_MAX})`);
    expect(code).toContain(`milestone_label text not null default '' check (char_length(milestone_label) <= ${ROADMAP_MILESTONE_LABEL_MAX})`);
    expect(code).toContain('milestone_date date,');
    expect(code).toContain(`title text not null check (char_length(title) between 1 and ${PHASE_TITLE_MAX})`);
    expect(code).toContain(`note text not null default '' check (char_length(note) <= ${PHASE_NOTE_MAX})`);
    expect(code.match(/position double precision not null check \(position = position and abs\(position\) < 1e15\)/g)).toHaveLength(2);
    expect(code).toContain(`roadmap_id text not null check (char_length(roadmap_id) between 1 and ${ID_MAX})`);
    expect(code).toContain(`phase_id text not null check (char_length(phase_id) between 1 and ${ID_MAX})`);
    expect(code).toContain(`title text not null check (char_length(title) between 1 and ${ITEM_TITLE_MAX})`);
    expect(code).toContain(`note text not null default '' check (char_length(note) <= ${ITEM_NOTE_MAX})`);
    expect(code).toContain('planned_start date not null, planned_end date not null, actual_start date, actual_end date,');
    // `planned_end - planned_start <= 365` days apart = at most 366 days inclusive (ITEM_SPAN_MAX_DAYS).
    expect(code).toContain(`check (planned_end >= planned_start and planned_end - planned_start <= ${ITEM_SPAN_MAX_DAYS - 1})`);
    expect(code).toContain('check (actual_start is null or actual_end is null or actual_end >= actual_start)');
    expect(code).toContain(`title text not null check (char_length(title) between 1 and ${CHECKPOINT_TITLE_MAX})`);
    expect(code).toContain(`note text not null default '' check (char_length(note) <= ${CHECKPOINT_NOTE_MAX})`);
    expect(code).toContain('date date not null,');
    expect(code).toContain(`max_score numeric(7,1) not null check (max_score > 0 and max_score <= ${CHECKPOINT_SCORE_MAX})`);
    expect(code).toContain('threshold numeric(7,1) check (threshold is null or (threshold >= 0 and threshold <= max_score))');
    expect(code).toContain('score numeric(7,1) check (score is null or (score >= 0 and score <= max_score))');
  });

  it('every table: RLS on, three policies to authenticated using (select auth.uid()) = user_id, the shared trigger, the pull index', () => {
    for (const t of TABLES) {
      expect(code, t).toContain(`alter table public.${t} enable row level security`);
      for (const op of ['select', 'insert', 'update']) {
        expect(code, `${t} ${op}`).toContain(`drop policy if exists ${t}_${op}_own on public.${t};`);
        expect(code, `${t} ${op}`).toMatch(new RegExp(`create policy ${t}_${op}_own on public\\.${t} for ${op} to authenticated`));
      }
      expect(code, t).toContain(`drop trigger if exists ${t}_sync_before_write on public.${t};`);
      expect(code, t).toContain(`create trigger ${t}_sync_before_write before insert or update on public.${t} for each row execute function public.sync_before_write()`);
      expect(code, t).toContain(`create index if not exists ${t}_pull_idx on public.${t} (user_id, server_updated_at, id)`);
    }
    const policies = code.match(/create policy[^;]*;/g) ?? [];
    expect(policies).toHaveLength(12);
    for (const p of policies) {
      expect(p).toContain('to authenticated');
      expect(p).toContain('(select auth.uid()) = user_id');
    }
    expect(code.match(/create trigger/g)).toHaveLength(4);
    expect(code.match(/create index if not exists/g)).toHaveLength(4);
  });

  it('grants: revoke all from anon, authenticated; grant select, insert, update to authenticated only; nothing else', () => {
    expect(code).toContain('revoke all on public.roadmaps, public.roadmap_phases, public.roadmap_items, public.roadmap_checkpoints from anon, authenticated');
    const grants = code.match(/grant [^;]*;/g) ?? [];
    expect(grants).toHaveLength(1);
    expect(grants[0]).toBe('grant select, insert, update on public.roadmaps, public.roadmap_phases, public.roadmap_items, public.roadmap_checkpoints to authenticated;');
    expect(code).not.toMatch(/grant[^;]*anon/);
    expect(code).not.toMatch(/grant[^;]*delete/);
  });

  it('never: a delete policy, anon/public policies, RLS off, drop table/function, data statements, a redefinition of sync_before_write, or a touch on the old tables', () => {
    expect(code).not.toMatch(/for delete/);
    expect(code).not.toMatch(/create policy[^;]*to anon/);
    expect(code).not.toMatch(/create policy[^;]*to public/);
    expect(code).not.toMatch(/disable row level security/);
    expect(code).not.toMatch(/drop table/);
    expect(code).not.toMatch(/drop function/);
    expect(code).not.toMatch(/delete from/);
    expect(code).not.toMatch(/truncate/);
    expect(code).not.toMatch(/\bupdate public\./);
    expect(code).not.toMatch(/\binsert into\b/);
    expect(code).not.toMatch(/create or replace function/);
    expect(code).not.toMatch(/alter table public\.(goals|entries|settings)/);
    expect(code).not.toMatch(/on public\.(goals|entries|settings)\b/);
    expect(code).not.toContain(['service', 'role'].join('_')); // the secret-key role name (DoD 14 forbids the literal in sources)
  });

  it('is idempotent on paper: every create of a policy/trigger is preceded by its drop if exists; tables and indexes use if not exists', () => {
    for (const m of code.matchAll(/create policy (\w+) on public\.(\w+)/g)) expect(code.indexOf(`drop policy if exists ${m[1]} on public.${m[2]};`)).toBeLessThan(m.index!);
    for (const m of code.matchAll(/create trigger (\w+) before/g)) expect(code.indexOf(`drop trigger if exists ${m[1]} on`)).toBeLessThan(m.index!);
    expect(code.match(/create (table|index)(?! if not exists)/g)).toBeNull();
  });
});
