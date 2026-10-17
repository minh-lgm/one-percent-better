import { describe, expect, it } from 'vitest';
import { dismissed, EMPTY_LOGIN_PROMPT, firstCreatedAt, isSnoozed, normalizeLoginPrompt, shouldShowExportHint, shouldShowLoginPrompt, type LoginPromptInput } from './login-prompt';

// M8-AC1: now = 2026-10-09T10:00+07:00.
const NOW = new Date('2026-10-09T10:00:00+07:00');
const DAY = 86_400_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const base: LoginPromptInput = {
  now: NOW,
  auth: 'signed-out',
  online: true,
  firstDataAt: ago(7 * DAY),
  entryCount: 0,
  state: EMPTY_LOGIN_PROMPT,
};

describe('shouldShowLoginPrompt (FR-52, A-30)', () => {
  it('base case: cloud on, signed out, online, first record 7 days ago, 0 entries, never dismissed → true', () => {
    expect(shouldShowLoginPrompt(base)).toBe(true);
  });

  it.each<[string, Partial<LoginPromptInput>]>([
    ['cloud off', { auth: 'unavailable' }],
    ['signed in', { auth: 'signed-in' }],
    ['signing in', { auth: 'signing-in' }],
    ['expired (A-D27: the Account card handles it)', { auth: 'expired' }],
    ['offline', { online: false }],
    ['6 days 23 h and 9 entries', { firstDataAt: ago(6 * DAY + 23 * 3_600_000), entryCount: 9 }],
    ['no data', { firstDataAt: null, entryCount: 0 }],
    ['unparsable firstDataAt', { firstDataAt: 'not-a-date', entryCount: 0 }],
  ])('%s → false', (_name, patch) => {
    expect(shouldShowLoginPrompt({ ...base, ...patch })).toBe(false);
  });

  it('10 entries created just now → true (entries count regardless of age)', () => {
    expect(shouldShowLoginPrompt({ ...base, firstDataAt: NOW.toISOString(), entryCount: 10 })).toBe(true);
  });

  it('snooze: "Not now" 13 days ago → false; 14 days ago → true', () => {
    expect(shouldShowLoginPrompt({ ...base, state: { ...EMPTY_LOGIN_PROMPT, dismissCount: 1, lastDismissedAt: ago(13 * DAY) } })).toBe(false);
    expect(shouldShowLoginPrompt({ ...base, state: { ...EMPTY_LOGIN_PROMPT, dismissCount: 1, lastDismissedAt: ago(14 * DAY) } })).toBe(true);
  });

  it('three dismissals: never again on Today, even 100 days later', () => {
    expect(shouldShowLoginPrompt({ ...base, state: { ...EMPTY_LOGIN_PROMPT, dismissCount: 3, lastDismissedAt: ago(100 * DAY) } })).toBe(false);
    expect(shouldShowLoginPrompt({ ...base, state: { ...EMPTY_LOGIN_PROMPT, dismissCount: 2, lastDismissedAt: ago(100 * DAY) } })).toBe(true);
  });

  it('dismissed() increments the count and stamps the time', () => {
    expect(dismissed(EMPTY_LOGIN_PROMPT, NOW)).toEqual({ dismissCount: 1, lastDismissedAt: NOW.toISOString(), lastExportHintAt: null });
    expect(dismissed({ dismissCount: 2, lastDismissedAt: ago(DAY), lastExportHintAt: ago(DAY) }, NOW)).toEqual({ dismissCount: 3, lastDismissedAt: NOW.toISOString(), lastExportHintAt: ago(DAY) });
  });
});

describe('shouldShowExportHint (FR-53, A-30)', () => {
  it('cloud on, signed out, never hinted → true', () => {
    expect(shouldShowExportHint({ now: NOW, auth: 'signed-out', state: EMPTY_LOGIN_PROMPT })).toBe(true);
  });

  it('hinted 29 days ago → false; 30 days ago → true', () => {
    expect(shouldShowExportHint({ now: NOW, auth: 'signed-out', state: { ...EMPTY_LOGIN_PROMPT, lastExportHintAt: ago(29 * DAY) } })).toBe(false);
    expect(shouldShowExportHint({ now: NOW, auth: 'signed-out', state: { ...EMPTY_LOGIN_PROMPT, lastExportHintAt: ago(30 * DAY) } })).toBe(true);
  });

  it.each(['signed-in', 'expired', 'signing-in', 'unavailable'] as const)('%s → false', (auth) => {
    expect(shouldShowExportHint({ now: NOW, auth, state: EMPTY_LOGIN_PROMPT })).toBe(false);
  });

  it('a corrupt timestamp counts as never hinted', () => {
    expect(shouldShowExportHint({ now: NOW, auth: 'signed-out', state: { ...EMPTY_LOGIN_PROMPT, lastExportHintAt: 'garbage' } })).toBe(true);
  });
});

describe('normalizeLoginPrompt / firstCreatedAt', () => {
  it('fills defaults for missing or corrupt rows', () => {
    expect(normalizeLoginPrompt(undefined)).toEqual(EMPTY_LOGIN_PROMPT);
    expect(normalizeLoginPrompt('x')).toEqual(EMPTY_LOGIN_PROMPT);
    expect(normalizeLoginPrompt({ dismissCount: -2, lastDismissedAt: 'nope', lastExportHintAt: 5 })).toEqual(EMPTY_LOGIN_PROMPT);
    expect(normalizeLoginPrompt({ dismissCount: 2.7, lastDismissedAt: '2026-10-01T00:00:00.000Z' })).toEqual({ dismissCount: 2, lastDismissedAt: '2026-10-01T00:00:00.000Z', lastExportHintAt: null });
  });

  it('firstCreatedAt picks the earliest instant and ignores unparsable stamps', () => {
    expect(firstCreatedAt([])).toBeNull();
    expect(firstCreatedAt([{ createdAt: 'bad' }])).toBeNull();
    expect(firstCreatedAt([{ createdAt: '2026-10-05T00:00:00.000Z' }, { createdAt: '2026-10-01T07:00:00+07:00' }, { createdAt: 'bad' }])).toBe('2026-10-01T07:00:00+07:00');
  });
});

describe('future stamps are ignored (M10-AC7, A-46, M8-D1)', () => {
  const now = new Date('2026-10-09T10:00:00+07:00');
  const H = 3_600_000;
  const D = 86_400_000;
  const at = (ms: number) => new Date(now.getTime() + ms).toISOString();

  it('isSnoozed: lastDismissedAt now + 25 h → false; now + 23 h → true; now − 13 d → true; now − 14 d → false', () => {
    const state = (lastDismissedAt: string) => ({ ...EMPTY_LOGIN_PROMPT, dismissCount: 1, lastDismissedAt });
    expect(isSnoozed(now, state(at(25 * H)))).toBe(false);
    expect(isSnoozed(now, state(at(23 * H)))).toBe(true);
    expect(isSnoozed(now, state(at(-13 * D)))).toBe(true);
    expect(isSnoozed(now, state(at(-14 * D)))).toBe(false);
    expect(isSnoozed(now, state('2099-01-01T00:00:00.000Z'))).toBe(false);
  });

  it('shouldShowExportHint: lastExportHintAt now + 25 h → true; now + 23 h → false; now − 29 d → false; now − 30 d → true', () => {
    const input = (lastExportHintAt: string) => ({ now, auth: 'signed-out' as const, state: { ...EMPTY_LOGIN_PROMPT, lastExportHintAt } });
    expect(shouldShowExportHint(input(at(25 * H)))).toBe(true);
    expect(shouldShowExportHint(input(at(23 * H)))).toBe(false);
    expect(shouldShowExportHint(input(at(-29 * D)))).toBe(false);
    expect(shouldShowExportHint(input(at(-30 * D)))).toBe(true);
  });

  it('the banner shows again with a 2099 "Not now" (the original M8-D1 report)', () => {
    expect(
      shouldShowLoginPrompt({
        now,
        auth: 'signed-out',
        online: true,
        firstDataAt: at(-10 * D),
        entryCount: 0,
        state: { dismissCount: 1, lastDismissedAt: '2099-01-01T00:00:00.000Z', lastExportHintAt: null },
      }),
    ).toBe(true);
  });
});
