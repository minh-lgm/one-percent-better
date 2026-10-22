// M10-AC11: the strings DESIGN v3.1 settled must be in en.json / vi.json verbatim. The expected values are
// read from the copy tables of docs/design/DESIGN.md (rows `| \`key\` | milestone | where | \`en\` | \`vi\` |`).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { flattenMessages } from './parity';
import en from './resources/en.json';
import vi from './resources/vi.json';

const design = readFileSync(new URL('../../docs/design/DESIGN.md', import.meta.url), 'utf8');
const EN = flattenMessages(en);
const VI = flattenMessages(vi);

/** Split a markdown table row on `|` outside backticks. */
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inCode = false;
  for (const ch of line) {
    if (ch === '`') inCode = !inCode;
    if (ch === '|' && !inCode) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out.filter((c, i, a) => !(c === '' && (i === 0 || i === a.length - 1)));
}

const unquote = (c: string) => (c.startsWith('`') && c.endsWith('`') ? c.slice(1, -1) : c);

/** `{ en, vi }` from the last two columns of the row whose first cell is `key`; `vi` = null for `—`. */
function designCopy(key: string): { en: string; vi: string | null } {
  const line = design.split('\n').find((l) => l.startsWith(`| \`${key}\` |`));
  if (!line) throw new Error(`DESIGN.md has no copy row for ${key}`);
  const c = cells(line);
  const enText = unquote(c[c.length - 2]);
  const viCell = c[c.length - 1];
  // DESIGN writes "`x` (= en)" when the Vietnamese value is the English one (brand strings).
  if (/\(= en\)\s*$/.test(viCell)) return { en: enText, vi: enText };
  return { en: enText, vi: viCell === '—' ? null : unquote(viCell) };
}

const KEYS = [
  'settings.account.localRejected_one',
  'settings.account.localRejected_other',
  'auth.signOut.rejected_one',
  'auth.signOut.rejected_other',
  'auth.signOut.rejectedKeep',
  'auth.signOut.rejectedRemove',
  'auth.signOut.removeDescRejected',
  'settings.about.privacyLink',
  'errors.IMPORT_INVALID_SCHEMA_outOfRange',
  'errors.EXPORT_FAILED',
  'empty.day.noGoals',
  // v5.0 (M12-AC11): the 15 native-variant keys of DESIGN 7.8.1.
  'settings.language.nativeNote',
  'settings.permission.nativeUnsupportedDesc',
  'settings.backup.shareHint',
  'backup.banner.neverNative',
  'errors.EXPORT_FAILED_native',
  'toast.icsShared',
  'settings.storage.nativeLabel',
  'settings.storage.nativeChip',
  'settings.storage.nativeDesc',
  'settings.about.descNative',
  'storageError.bodyNative',
  'storageError.step1Native',
  'storageError.step2Native',
  'storageError.step3Native',
  'a11y.opensExternal',
  // v5.0 (M15-AC11): the 9 keys of DESIGN 7.8.4 / 7.8.5.
  'notification.nativeTitle',
  'notification.nativeBody',
  'settings.reminders.nativeSwitchDesc',
  'settings.reminders.nativeInfo',
  'settings.permission.nativeDefaultDesc',
  'settings.permission.nativeGrantedDesc',
  'settings.permission.nativeDeniedDesc',
  'settings.permission.nativeDefaultOnDesc',
  'settings.about.supportLink',
];

describe('en.json / vi.json match DESIGN verbatim (M10-AC11, M12-AC11)', () => {
  for (const key of KEYS) {
    it(key, () => {
      const expected = designCopy(key);
      expect(EN[key], `en ${key}`).toBe(expected.en);
      if (expected.vi !== null) expect(VI[key], `vi ${key}`).toBe(expected.vi);
      else expect(VI[key], `vi ${key} (plural _one has no vi form)`).toBeUndefined();
    });
  }

  it('the two en strings DESIGN v3.1 changed are the new wording', () => {
    expect(EN['auth.signOut.rejectedKeep']).toBe('Whatever couldn\'t be uploaded stays on this device if you keep the data here. Export a backup to keep a copy.');
    expect(EN['auth.signOut.rejectedRemove']).toBe('If you remove the data from this device, anything that couldn\'t be uploaded will be lost. Export a backup first to keep it.');
  });
});

// ---- v4.0 (M11-AC11): the 12 keys of DESIGN v4.0, verbatim in both languages ----
const KEYS_V4 = [
  'goal.form.endsNever',
  'goal.form.endsNeverHint',
  'goal.form.endsNeverTotalNote',
  'goal.form.endsNeverSwitched',
  'goals.rowDailyOpen',
  'goal.detail.subDayOpen',
  'goal.detail.chartSummaryOpen',
  'goal.detail.chartSummaryEmptyOpen',
  'stat.progressSubOpen',
  'review.progressNoteOpen',
  'errors.GOAL_PERIOD_INVALID_openEndedTotal',
  'errors.DATE_OUTSIDE_GOAL_PERIOD_openEnded',
];

describe('en.json / vi.json match DESIGN v4.0 verbatim (M11-AC11, A-56)', () => {
  for (const key of KEYS_V4) {
    it(key, () => {
      const expected = designCopy(key);
      expect(EN[key], `en ${key}`).toBe(expected.en);
      expect(VI[key], `vi ${key}`).toBe(expected.vi);
    });
  }

  it('the vi label of the third radio is the user\'s wording (A-56); en is "No end date" (A-D61)', () => {
    expect(VI['goal.form.endsNever']).toBe('Không có thời hạn');
    expect(EN['goal.form.endsNever']).toBe('No end date');
    expect(KEYS_V4).toHaveLength(12);
  });
});

// ---- v5.0 (M14-AC11): the 33 keys of DESIGN 7.8.2 (Sign in with Apple) and 7.8.3 (Delete account, D6, Apple panel, errors, toasts) ----
const KEYS_M14 = [
  'auth.signInApple',
  'settings.account.descSignedOutIos',
  'settings.account.privacyNoteIos',
  'settings.account.hideEmailNote',
  'settings.account.providerApple',
  'settings.account.providerBoth',
  'errors.AUTH_FAILED_native',
  'exportHint.textNative',
  'settings.account.delete',
  'settings.account.deleteDesc',
  'settings.account.deleteOffline',
  'settings.account.deleteExpired',
  'auth.delete.title',
  'auth.delete.body',
  'auth.delete.account',
  'auth.delete.appleNote',
  'auth.delete.legend',
  'auth.delete.remove',
  'auth.delete.removeDesc',
  'auth.delete.keep',
  'auth.delete.keepDesc',
  'auth.delete.confirm',
  'auth.delete.working',
  'auth.delete.workingStatus',
  'auth.delete.revokeTitle',
  'auth.delete.revokeBody',
  'auth.delete.revokeLink',
  'errors.ACCOUNT_DELETE_OFFLINE',
  'errors.ACCOUNT_DELETE_CANCELLED',
  'errors.ACCOUNT_DELETE_FAILED',
  'errors.ACCOUNT_DELETE_SESSION_EXPIRED',
  'toast.accountDeletedKept',
  'toast.accountDeletedRemoved',
];

describe('en.json / vi.json match DESIGN v5.0 7.8.2 / 7.8.3 verbatim (M14-AC11)', () => {
  it('exactly 33 keys', () => {
    expect(KEYS_M14).toHaveLength(33);
  });
  for (const key of KEYS_M14) {
    it(key, () => {
      const expected = designCopy(key);
      expect(EN[key], `en ${key}`).toBe(expected.en);
      expect(VI[key], `vi ${key}`).toBe(expected.vi);
    });
  }
});
