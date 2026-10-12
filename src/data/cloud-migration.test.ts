// Static checks on the SQL migration (M6-AC10, ARCHITECTURE §8 "Tĩnh (SQL)"). Always runs in `npm test`;
// the behavioural RLS/trigger tests need Supabase local (Docker) and live in tests/db (`npm run test:db`).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SQL_PATH = fileURLToPath(new URL('../../supabase/migrations/20261012000000_cloud_sync.sql', import.meta.url));
const sql = readFileSync(SQL_PATH, 'utf8');
// Strip `-- comments` so prose cannot satisfy or trip the assertions.
const code = sql
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
  .replace(/\s+/g, ' ')
  .toLowerCase();

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
