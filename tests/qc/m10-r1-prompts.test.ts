// QC M10 round 1 - M10-AC7 / A-46: edges the developer tests do not pin down (exact 24 h boundary, unparsable stamps,
// sub-millisecond ordering, interaction with the 3-dismissal cap, 3 concurrent tabs, hint claim with future stamps).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DexieEntryRepository } from '../../src/data/dexie/entry-repo';
import { DexieGoalRepository } from '../../src/data/dexie/goal-repo';
import { DexieKvRepository } from '../../src/data/dexie/kv-repo';
import type { AppDatabase } from '../../src/data/dexie/db';
import { CLOCK_SKEW_TOLERANCE_MS, isSnoozed, shouldShowExportHint, shouldShowLoginPrompt, type LoginPromptState } from '../../src/domain/login-prompt';
import { LoginPromptService } from '../../src/services/login-prompt-service';
import { buildGoal } from '../../src/test/builders';
import { createTestDatabase } from '../../src/test/db';

const NOW = new Date('2026-10-09T10:00:00+07:00');
const DAY = 86_400_000;
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();
const state = (over: Partial<LoginPromptState>): LoginPromptState => ({ dismissCount: 1, lastDismissedAt: null, lastExportHintAt: null, ...over });

describe('A-46 tolerance is exactly 24 h (inclusive) for lastDismissedAt', () => {
  it('constant is 24 h', () => expect(CLOCK_SKEW_TOLERANCE_MS).toBe(DAY));
  it('now + 24 h exactly still counts (snoozed); now + 24 h + 1 ms is ignored (not snoozed)', () => {
    expect(isSnoozed(NOW, state({ lastDismissedAt: at(DAY) }))).toBe(true);
    expect(isSnoozed(NOW, state({ lastDismissedAt: at(DAY + 1) }))).toBe(false);
  });
  it('a stamp that is 24 h in the future can silence for at most 14 days + 24 h (A-46 text): snoozed at now+14d, not at now+15d+1ms', () => {
    const s = state({ lastDismissedAt: at(DAY) });
    expect(isSnoozed(new Date(NOW.getTime() + 14 * DAY), s)).toBe(true);
    expect(isSnoozed(new Date(NOW.getTime() + 15 * DAY), s)).toBe(false);
  });
  it('14-day boundary in the past is unchanged: -14 d - 0 ms not snoozed, -14 d + 1 ms snoozed', () => {
    expect(isSnoozed(NOW, state({ lastDismissedAt: at(-14 * DAY) }))).toBe(false);
    expect(isSnoozed(NOW, state({ lastDismissedAt: at(-14 * DAY + 1) }))).toBe(true);
  });
  it('unparsable and empty stamps are never snoozed, whatever the count', () => {
    expect(isSnoozed(NOW, state({ lastDismissedAt: 'not a date' }))).toBe(false);
    expect(isSnoozed(NOW, state({ lastDismissedAt: '' }))).toBe(false);
    expect(isSnoozed(NOW, state({ lastDismissedAt: null }))).toBe(false);
  });
  it('year 9999 and +Infinity-like stamps are ignored', () => {
    expect(isSnoozed(NOW, state({ lastDismissedAt: '9999-12-31T23:59:59.999Z' }))).toBe(false);
    expect(isSnoozed(NOW, state({ lastDismissedAt: '+275760-09-13T00:00:00.000Z' }))).toBe(false);
  });
});

describe('A-46 for lastExportHintAt', () => {
  const ctx = (lastExportHintAt: string | null) => ({ now: NOW, auth: 'signed-out' as const, state: state({ lastExportHintAt }) });
  it('now + 24 h exactly counts as a real hint 0 s ago (no hint); now + 24 h + 1 ms is ignored (hint)', () => {
    expect(shouldShowExportHint(ctx(at(DAY)))).toBe(false);
    expect(shouldShowExportHint(ctx(at(DAY + 1)))).toBe(true);
  });
  it('30-day boundary unchanged', () => {
    expect(shouldShowExportHint(ctx(at(-30 * DAY)))).toBe(true);
    expect(shouldShowExportHint(ctx(at(-30 * DAY + 1)))).toBe(false);
  });
  it('signed-in / expired / unavailable never get a hint even with a future stamp', () => {
    for (const auth of ['signed-in', 'expired', 'unavailable', 'signing-in'] as const) expect(shouldShowExportHint({ now: NOW, auth, state: state({ lastExportHintAt: at(5 * DAY) }) })).toBe(false);
  });
});

describe('A-46 does not undo the 3-dismissal cap', () => {
  it('dismissCount 3 with a future stamp stays hidden (count is kept, only the snooze stamp is ignored)', () => {
    const base = { now: NOW, auth: 'signed-out' as const, online: true, firstDataAt: at(-30 * DAY), entryCount: 20 };
    expect(shouldShowLoginPrompt({ ...base, state: state({ dismissCount: 3, lastDismissedAt: '2099-01-01T00:00:00.000Z' }) })).toBe(false);
    expect(shouldShowLoginPrompt({ ...base, state: state({ dismissCount: 2, lastDismissedAt: '2099-01-01T00:00:00.000Z' }) })).toBe(true);
  });
});

describe('LoginPromptService.dismiss with future stamps and concurrent tabs', () => {
  let db: AppDatabase;
  const mk = (): LoginPromptService => new LoginPromptService(new DexieKvRepository(db), new DexieGoalRepository(db, () => NOW), new DexieEntryRepository(db, () => NOW));
  beforeEach(async () => {
    db = createTestDatabase();
    await db.open();
    await db.goals.put(buildGoal({ id: 'g1', createdAt: at(-10 * DAY) }));
  });
  afterEach(async () => {
    await db.delete();
  });

  it('with a 2099 stamp the banner is due; Not now rewrites the stamp to now and counts once (1 -> 2)', async () => {
    await db.kv.put({ key: 'loginPrompt', value: { dismissCount: 1, lastDismissedAt: '2099-01-01T00:00:00.000Z', lastExportHintAt: null } });
    const s = mk();
    expect((await s.state(NOW, { auth: 'signed-out', online: true })).banner).toBe(true);
    expect(await s.dismiss(NOW)).toEqual({ dismissCount: 2, lastDismissedAt: NOW.toISOString(), lastExportHintAt: null });
    expect((await s.state(NOW, { auth: 'signed-out', online: true })).banner).toBe(false);
  });

  it('five tabs pressing Not now at once burn exactly one dismissal; a stale tab pressing later (still inside the snooze) burns none', async () => {
    const tabs = Array.from({ length: 5 }, mk);
    const results = await Promise.all(tabs.map((t) => t.dismiss(NOW)));
    expect(await mk().getState()).toMatchObject({ dismissCount: 1, lastDismissedAt: NOW.toISOString() });
    for (const r of results) expect(r.dismissCount).toBe(1);
    await mk().dismiss(new Date(NOW.getTime() + 13 * DAY));
    expect(await mk().getState()).toMatchObject({ dismissCount: 1, lastDismissedAt: NOW.toISOString() });
    await mk().dismiss(new Date(NOW.getTime() + 14 * DAY));
    expect(await mk().getState()).toMatchObject({ dismissCount: 2 });
  });

  it('a tab whose clock is behind (now earlier than the stamp by < 24 h) cannot double count either', async () => {
    const s = mk();
    await s.dismiss(NOW);
    await s.dismiss(new Date(NOW.getTime() - 3_600_000));
    expect(await s.getState()).toMatchObject({ dismissCount: 1, lastDismissedAt: NOW.toISOString() });
  });

  it('claimExportHint with a 2099 stamp claims once and rewrites the stamp; the second claim the same minute loses', async () => {
    await db.kv.put({ key: 'loginPrompt', value: { dismissCount: 0, lastDismissedAt: null, lastExportHintAt: '2099-01-01T00:00:00.000Z' } });
    const a = mk();
    const b = mk();
    const r = await Promise.all([a.claimExportHint(NOW, { auth: 'signed-out', online: true }), b.claimExportHint(NOW, { auth: 'signed-out', online: true })]);
    expect(r.filter(Boolean)).toHaveLength(1);
    expect((await a.getState()).lastExportHintAt).toBe(NOW.toISOString());
  });
});
