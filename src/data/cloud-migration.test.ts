// Static checks on the SQL migrations (M6-AC10, M11-AC8, ARCHITECTURE §8 "Tĩnh (SQL)"). Always runs in
// `npm test`; the behavioural RLS/trigger tests need Supabase local (Docker) and live in tests/db (`npm run test:db`).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SQL_PATH = fileURLToPath(new URL('../../supabase/migrations/20261012000000_cloud_sync.sql', import.meta.url));
const sql = readFileSync(SQL_PATH, 'utf8');
/** Strip `-- comments` so prose cannot satisfy or trip the assertions. */
function stripComments(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}
const code = stripComments(sql);

const TABLES = ['goals', 'entries', 'settings'] as const;

describe('supabase/migrations/20261012000000_cloud_sync.sql', () => {
  it('creates the three tables with user_id defaulting to auth.uid() and cascading from auth.users', () => {
    for (const t of TABLES) {
      expect(code, t).toContain(`create table public.${t} (`);
    }
    expect(code).toContain('user_id uuid not null default auth.uid() references auth.users (id) on delete cascade, id text not null');
    expect(code).toContain('user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade');
  });

  it('enables row level security on goals, entries and settings', () => {
    for (const t of TABLES) {
      expect(code, t).toContain(`alter table public.${t} enable row level security`);
    }
  });

  it('has select/insert/update policies "to authenticated" for each table, and no policy for delete or anon', () => {
    for (const t of TABLES) {
      for (const op of ['select', 'insert', 'update']) {
        expect(code, `${t} ${op}`).toMatch(new RegExp(`create policy ${t}_${op}_own on public\\.${t} for ${op} to authenticated`));
      }
    }
    expect(code).not.toMatch(/for delete/);
    expect(code).not.toMatch(/create policy[^;]*to anon/);
    expect(code).not.toMatch(/create policy[^;]*to public/);
    // Every policy is scoped by the caller's id.
    const policies = code.match(/create policy[^;]*;/g) ?? [];
    expect(policies).toHaveLength(9);
    for (const p of policies) expect(p).toContain('(select auth.uid()) = user_id');
  });

  it('grants only select, insert, update to authenticated — nothing to anon, no delete', () => {
    const grants = code.match(/grant [^;]*;/g) ?? [];
    expect(grants.length).toBeGreaterThanOrEqual(2);
    for (const g of grants) {
      expect(g).toMatch(/^grant select, insert, update on [^;]* to authenticated;$/);
      expect(g).not.toContain('anon');
      expect(g).not.toContain('delete');
    }
    expect(code).toContain('revoke all on public.goals, public.entries from anon, authenticated');
    expect(code).toContain('revoke all on public.settings from anon, authenticated');
  });

  it('installs the LWW triggers: sync_before_write on goals/entries, settings_before_write on settings', () => {
    expect(code).toContain('create or replace function public.sync_before_write() returns trigger');
    expect(code).toContain('create trigger goals_sync_before_write before insert or update on public.goals for each row execute function public.sync_before_write()');
    expect(code).toContain('create trigger entries_sync_before_write before insert or update on public.entries for each row execute function public.sync_before_write()');
    expect(code).toContain('create or replace function public.settings_before_write() returns trigger');
    expect(code).toContain('create trigger settings_before_write before insert or update on public.settings for each row execute function public.settings_before_write()');
    // Both functions pin search_path and force the owner.
    expect(code.match(/set search_path = ''/g)).toHaveLength(2);
    expect(code.match(/new\.user_id := auth\.uid\(\)/g)).toHaveLength(2);
    expect(code).toContain('if new.updated_at <= old.updated_at then return null');
  });

  it('settings stores only the synced preference groups (NFR-16): no device-only fields', () => {
    const settingsDef = code.slice(code.indexOf('create table public.settings ('), code.indexOf(');', code.indexOf('create table public.settings (')));
    for (const col of ['last_reminder_date', 'plus_one_shown', 'last_backup_at', 'active_timer', 'lastreminderdate', 'plusoneshown', 'lastbackupat']) {
      expect(settingsDef).not.toContain(col);
    }
    for (const col of ['reminder_enabled boolean', 'reminder_time text', 'reminder_updated_at timestamptz', "locale text check (locale in ('en', 'vi'))", 'locale_updated_at timestamptz']) {
      expect(settingsDef).toContain(col);
    }
  });

  it('mirrors the domain limits (name 60, why/note 280, minutes 1–1440, target 1–600000)', () => {
    expect(code).toContain('check (char_length(name) between 1 and 60)');
    expect(code).toContain('check (char_length(why) <= 280)');
    expect(code).toContain('check (char_length(note) <= 280)');
    expect(code).toContain('check (minutes between 1 and 1440)');
    expect(code).toContain('check (target_minutes between 1 and 600000)');
    expect(code).toContain("check (target_type in ('daily', 'total'))");
    expect(code).toContain("check (source in ('manual', 'timer'))");
  });
});

// ---- v4.0 (M11-AC8, ARCH §4.6 f, ADR-33): the second migration, and the first one left untouched ----
const SQL2_PATH = fileURLToPath(new URL('../../supabase/migrations/20261019000000_goal_open_ended.sql', import.meta.url));
const sql2 = readFileSync(SQL2_PATH, 'utf8');
const code2 = stripComments(sql2);

describe('supabase/migrations/20261019000000_goal_open_ended.sql (M11-AC8)', () => {
  it('the M6 file is byte-for-byte the one the project already ran (U6): history is never rewritten', () => {
    // sha256 of 20261012000000_cloud_sync.sql at commit 2a632ca (before M11). Changing that file means a
    // project that ran U6 would silently differ from the repo; new schema changes go into new files.
    expect(createHash('sha256').update(sql).digest('hex')).toBe('68927c4ce41abc28ddb36fa33080dbd3e7b7b4e03034315fc01c51e5afdb40c8');
  });

  it('drops NOT NULL on goals.end_date', () => {
    expect(code2).toContain('alter table public.goals alter column end_date drop not null');
  });

  it('adds goals_period_check (NULL or end ≥ start) and goals_open_ended_daily_check (NULL only for daily), each after `drop constraint if exists`', () => {
    expect(code2).toContain('add constraint goals_period_check check (end_date is null or end_date >= start_date)');
    expect(code2).toContain("add constraint goals_open_ended_daily_check check (end_date is not null or target_type = 'daily')");
    const adds = code2.match(/add constraint (\w+)/g) ?? [];
    expect(adds).toHaveLength(2);
    for (const name of ['goals_period_check', 'goals_open_ended_daily_check']) {
      const drop = code2.indexOf(`alter table public.goals drop constraint if exists ${name}`);
      const add = code2.indexOf(`add constraint ${name}`);
      expect(drop, `drop if exists ${name}`).toBeGreaterThanOrEqual(0);
      expect(drop, `${name}: drop before add`).toBeLessThan(add);
    }
  });

  it('drops the unnamed M6 check by its definition (end_date >= start_date), sparing the two new names', () => {
    expect(code2).toMatch(/pg_get_constraintdef\(oid\) ilike '%end_date >= start_date%'/);
    expect(code2).toContain("conname not in ('goals_period_check', 'goals_open_ended_daily_check')");
    expect(code2).toContain("conrelid = 'public.goals'::regclass and contype = 'c'");
    expect(code2).toMatch(/execute format\('alter table public\.goals drop constraint %i', c\.conname\)/);
  });

  it('touches nothing else: no grants to anon, no delete policy, RLS stays on, no policy/trigger drops, no data statements', () => {
    expect(code2).not.toMatch(/grant[^;]*anon/);
    expect(code2).not.toMatch(/\bgrant\b/);
    expect(code2).not.toMatch(/for delete/);
    expect(code2).not.toMatch(/disable row level security/);
    expect(code2).not.toMatch(/drop policy/);
    expect(code2).not.toMatch(/drop trigger/);
    expect(code2).not.toMatch(/drop function/);
    expect(code2).not.toMatch(/delete from/);
    expect(code2).not.toMatch(/truncate/);
    expect(code2).not.toMatch(/\bupdate public\./);
    expect(code2).not.toMatch(/drop table/);
    expect(code2).not.toMatch(/alter table public\.(entries|settings)/);
    // The rollback lives in a comment only (never executed): `set not null` must not be live code.
    expect(code2).not.toContain('set not null');
    expect(sql2).toContain('set not null');
  });

  it('the file name has 14 digits like the M6 file, so the CLI applies them in order', () => {
    expect(SQL2_PATH).toMatch(/[\\/]20261019000000_goal_open_ended\.sql$/);
    expect(SQL_PATH).toMatch(/[\\/]20261012000000_cloud_sync\.sql$/);
    expect('20261012000000' < '20261019000000').toBe(true);
  });

  it('the M6 file still declares end_date NOT NULL with the inline check (the new file relaxes it at runtime)', () => {
    expect(code).toContain('end_date date not null check (end_date >= start_date)');
  });
});
