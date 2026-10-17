import { describe, expect, it } from 'vitest';
import { backoffMs, compareStamps, isNewer, isPurgeableTombstone, nextUpdatedAt, resolveIncoming, resolvePrefGroup, rewindCursor, sameVersion, stampMs } from './sync';

const T = (s: string) => s;

describe('resolveIncoming — last-write-wins per record (M7-AC3, FR-49, ADR-21)', () => {
  const live = (updatedAt: string) => ({ updatedAt, deletedAt: null });
  const gone = (updatedAt: string) => ({ updatedAt, deletedAt: updatedAt });

  it('(1) no local row → apply', () => {
    expect(resolveIncoming(undefined, live('2026-10-09T03:00:00.000Z'))).toBe('apply');
  });
  it('(2) remote newer, local dirty → apply', () => {
    expect(resolveIncoming(live('2026-10-09T03:00:00.000Z'), live('2026-10-09T03:00:01.000Z'))).toBe('apply');
  });
  it('(3) remote older, local dirty → keep-local', () => {
    expect(resolveIncoming(live('2026-10-09T03:00:01.000Z'), live('2026-10-09T03:00:00.000Z'))).toBe('keep-local');
  });
  it('(4) equal instants, different content → apply (tie → server)', () => {
    expect(resolveIncoming(live('2026-10-09T03:00:00.000Z'), live('2026-10-09T03:00:00.000Z'))).toBe('apply');
  });
  it('(5) remote tombstone newer → apply', () => {
    expect(resolveIncoming(live('2026-10-09T03:00:00.000Z'), gone('2026-10-09T03:05:00.000Z'))).toBe('apply');
  });
  it('(6) local tombstone newer than a live remote → keep-local', () => {
    expect(resolveIncoming(gone('2026-10-09T03:05:00.000Z'), live('2026-10-09T03:03:00.000Z'))).toBe('keep-local');
  });
  it('(7) live remote newer than a local tombstone → apply (the record comes back, A-24)', () => {
    expect(resolveIncoming(gone('2026-10-09T03:05:00.000Z'), live('2026-10-09T03:06:00.000Z'))).toBe('apply');
  });
  it('(8) +00:00 and .000Z spellings of the same instant are equal', () => {
    expect(compareStamps('2026-10-09T03:00:00+00:00', '2026-10-09T03:00:00.000Z')).toBe(0);
    expect(resolveIncoming(live('2026-10-09T03:00:00+00:00'), live('2026-10-09T03:00:00.000Z'))).toBe('apply');
    expect(sameVersion(live('2026-10-09T03:00:00+00:00'), live('2026-10-09T03:00:00.000Z'))).toBe(true);
    expect(sameVersion(live('2026-10-09T03:00:00.000Z'), gone('2026-10-09T03:00:00.000Z'))).toBe(false);
  });
  it('unparsable stamps sort first and never win', () => {
    expect(Number.isNaN(stampMs('nope'))).toBe(true);
    expect(isNewer('2026-10-09T03:00:00.000Z', 'nope')).toBe(true);
    expect(resolveIncoming(live('nope'), live('2026-10-09T03:00:00.000Z'))).toBe('apply');
  });
});

describe('nextUpdatedAt — monotonic (M7-AC3)', () => {
  const now = new Date('2026-10-09T03:00:00.000Z');
  it('now > previous → now', () => {
    expect(nextUpdatedAt(now, '2026-10-09T02:00:00.000Z')).toBe('2026-10-09T03:00:00.000Z');
  });
  it('now = previous → now', () => {
    expect(nextUpdatedAt(now, '2026-10-09T03:00:00.000Z')).toBe('2026-10-09T03:00:00.000Z');
  });
  it('now 10 minutes behind previous → previous + 1 ms', () => {
    expect(nextUpdatedAt(now, '2026-10-09T03:10:00.000Z')).toBe('2026-10-09T03:10:00.001Z');
  });
  it('no previous / garbage previous → now', () => {
    expect(nextUpdatedAt(now, undefined)).toBe(now.toISOString());
    expect(nextUpdatedAt(now, null)).toBe(now.toISOString());
    expect(nextUpdatedAt(now, 'garbage')).toBe(now.toISOString());
  });
});

describe('resolvePrefGroup — ARCHITECTURE §4.4 table (M7-AC17, FR-55)', () => {
  it('device never chose + cloud has a value → apply', () => {
    expect(resolvePrefGroup({ updatedAt: null, dirty: 0 }, { updatedAt: T('2026-10-09T03:00:00.000Z') })).toBe('apply');
  });
  it('device chose (dirty) + cloud empty → keep-local', () => {
    expect(resolvePrefGroup({ updatedAt: '2026-10-09T03:00:00.000Z', dirty: 1 }, null)).toBe('keep-local');
  });
  it('both empty → none', () => {
    expect(resolvePrefGroup({ updatedAt: null, dirty: 0 }, null)).toBe('none');
  });
  it('cloud ≥ local → apply (equal → apply)', () => {
    expect(resolvePrefGroup({ updatedAt: '2026-10-09T03:00:00.000Z', dirty: 1 }, { updatedAt: '2026-10-09T03:00:01.000Z' })).toBe('apply');
    expect(resolvePrefGroup({ updatedAt: '2026-10-09T03:00:00.000Z', dirty: 1 }, { updatedAt: '2026-10-09T03:00:00.000Z' })).toBe('apply');
  });
  it('cloud < local → keep-local', () => {
    expect(resolvePrefGroup({ updatedAt: '2026-10-09T03:00:01.000Z', dirty: 1 }, { updatedAt: '2026-10-09T03:00:00.000Z' })).toBe('keep-local');
  });
  it('the 1970 marker of phase-1 data loses to any cloud value', () => {
    expect(resolvePrefGroup({ updatedAt: '1970-01-01T00:00:00.000Z', dirty: 1 }, { updatedAt: '2026-10-09T03:00:00.000Z' })).toBe('apply');
    expect(resolvePrefGroup({ updatedAt: '1970-01-01T00:00:00.000Z', dirty: 1 }, null)).toBe('keep-local');
  });
});

describe('rewindCursor and backoff', () => {
  it('moves the stored cursor back 120 s and clears the id', () => {
    expect(rewindCursor({ serverUpdatedAt: '2026-10-09T03:02:00.000Z', id: 'z' })).toEqual({ serverUpdatedAt: '2026-10-09T03:00:00.000Z', id: '' });
    expect(rewindCursor(null)).toBeNull();
    expect(rewindCursor({ serverUpdatedAt: 'garbage', id: 'z' })).toBeNull();
  });
  it('backoff 30, 60, 120, 240, 480, 900, 900 s', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(backoffMs)).toEqual([30, 60, 120, 240, 480, 900, 900, 900].map((s) => s * 1000));
    expect(backoffMs(0)).toBe(30_000);
  });
});

describe('isPurgeableTombstone — ADR-29 rule table (M10-AC4)', () => {
  const now = new Date('2026-11-09T03:00:00.000Z');
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
  const synced = { neverSynced: false, retentionDays: 30 };
  const never = { neverSynced: true, retentionDays: 30 };

  it('live row → false', () => {
    expect(isPurgeableTombstone({ deletedAt: null, dirty: 0 }, now, synced)).toBe(false);
    expect(isPurgeableTombstone({ deletedAt: null, dirty: 1 }, now, never)).toBe(false);
  });

  it('deletedAt 31 days ago, dirty 0, device synced → true; 29 days → false; exactly 30 days → true', () => {
    expect(isPurgeableTombstone({ deletedAt: ago(31), dirty: 0 }, now, synced)).toBe(true);
    expect(isPurgeableTombstone({ deletedAt: ago(29), dirty: 0 }, now, synced)).toBe(false);
    expect(isPurgeableTombstone({ deletedAt: ago(30), dirty: 0 }, now, synced)).toBe(true);
  });

  it('dirty 1 on a device that synced → false; dirty 2 → true; dirty 1 on a device that never synced → true (31 days) / false (29 days)', () => {
    expect(isPurgeableTombstone({ deletedAt: ago(31), dirty: 1 }, now, synced)).toBe(false);
    expect(isPurgeableTombstone({ deletedAt: ago(31), dirty: 2 }, now, synced)).toBe(true);
    expect(isPurgeableTombstone({ deletedAt: ago(31), dirty: 1 }, now, never)).toBe(true);
    expect(isPurgeableTombstone({ deletedAt: ago(29), dirty: 1 }, now, never)).toBe(false);
  });

  it('unparsable deletedAt → false', () => {
    expect(isPurgeableTombstone({ deletedAt: 'not a date', dirty: 0 }, now, never)).toBe(false);
  });
});
