// `node scripts/gen-store-fixtures.mjs` — the App Store demo datasets (TASKS M15-T5, DESIGN v5.0 7.8.8):
// store/fixtures/demo-en.json and demo-vi.json, plain `schemaVersion: 1` backups generated from the deterministic
// rules of DESIGN 7.8.8 (one entry per day unless skipped; fixed ids; "today" = 2026-10-09). Deterministic: running
// it twice yields byte-identical files. The generated files are committed; src/test/store-fixtures.test.ts asserts
// the check values of DESIGN against them.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'store', 'fixtures');

export const DEMO_TODAY = '2026-10-09';
export const DEMO_EXPORTED_AT = '2026-10-09T12:30:00.000Z';
/** kv `settings.lastBackupAt` of the screenshot device (no "not backed up" banner, DESIGN 7.8.8). */
export const DEMO_LAST_BACKUP_AT = '2026-10-05T12:00:00.000Z';
/** Goals are created in table order (Read, Guitar, Spanish, Piano, Stretch): Today sorts by createdAt (DESIGN 7.8.8 screenshot 1). */
const stampOf = (index) => `2026-01-01T01:0${index}:00.000Z`;

/** DESIGN 7.8.8 goal table: id, names, why per locale, target, period. */
export const DEMO_GOALS = [
  { id: 'demo-read', name: { en: 'Read', vi: 'Đọc sách' }, why: { en: 'Finish 24 books this year', vi: 'Đọc xong 24 cuốn trong năm nay' }, targetMinutes: 30, startDate: '2026-01-01', endDate: '2026-12-31' },
  { id: 'demo-guitar', name: { en: 'Guitar', vi: 'Guitar' }, why: { en: 'Play my first full song', vi: 'Chơi trọn vẹn bài hát đầu tiên' }, targetMinutes: 20, startDate: '2026-08-01', endDate: '2026-12-31' },
  { id: 'demo-spanish', name: { en: 'Spanish', vi: 'Tiếng Tây Ban Nha' }, why: { en: 'Talk with Ana in Spanish', vi: 'Trò chuyện với Ana bằng tiếng Tây Ban Nha' }, targetMinutes: 15, startDate: '2026-06-01', endDate: null },
  { id: 'demo-piano', name: { en: 'Piano', vi: 'Piano' }, why: { en: 'Learn a small piece by heart', vi: 'Chơi thuộc lòng một bản nhạc nhỏ' }, targetMinutes: 25, startDate: '2026-11-01', endDate: '2026-12-31' },
  { id: 'demo-stretch', name: { en: 'Stretch', vi: 'Giãn cơ' }, why: { en: 'A looser back after long desk days', vi: 'Bớt đau lưng sau những ngày ngồi làm việc dài' }, targetMinutes: 10, startDate: '2026-09-01', endDate: '2026-09-30' },
];

/** Today's entries (DESIGN 7.8.8 "Hôm nay 2026-10-09"): minutes + note per locale; the other goals have none today. */
const TODAY_ENTRIES = {
  'demo-read': { minutes: 30, note: { en: 'Chapter 12', vi: 'Chương 12' } },
  'demo-guitar': { minutes: 22, note: { en: 'Scales and chorus', vi: 'Gam và điệp khúc' } },
  'demo-spanish': { minutes: 10, note: { en: 'Lesson 8', vi: 'Bài 8' } },
};

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const utc = (s) => new Date(`${s}T00:00:00Z`);
const addDays = (s, n) => iso(new Date(utc(s).getTime() + n * 86_400_000));
/** Day of year, 1 January = 1. */
const dayOfYear = (s) => Math.round((utc(s).getTime() - utc('2026-01-01').getTime()) / 86_400_000) + 1;

/** Minutes for `goalId` on `date` (before today), or null when the day is skipped (DESIGN 7.8.8 rules). */
export function demoMinutes(goalId, date) {
  const n = dayOfYear(date);
  const goal = DEMO_GOALS.find((g) => g.id === goalId);
  const i = Math.round((utc(date).getTime() - utc(goal.startDate).getTime()) / 86_400_000);
  switch (goalId) {
    case 'demo-read':
      return n % 7 === 3 ? null : 15 + 5 * (n % 6);
    case 'demo-guitar':
      return i % 6 === 5 ? null : 8 + Math.floor(i / 5) + (i % 2);
    case 'demo-spanish':
      return i % 5 === 4 ? null : 10 + 5 * (i % 3);
    case 'demo-stretch':
      return i % 4 === 3 ? null : 10;
    default:
      return null; // demo-piano: upcoming, no entries
  }
}

const entryId = (goalId, date) => `e-${goalId}-${date.replace(/-/g, '')}`;

export function buildDemoBackup(locale) {
  const goals = DEMO_GOALS.map((g, index) => ({
    id: g.id,
    name: g.name[locale],
    why: g.why[locale],
    targetType: 'daily',
    targetMinutes: g.targetMinutes,
    startDate: g.startDate,
    endDate: g.endDate,
    archived: false,
    createdAt: stampOf(index),
    updatedAt: stampOf(index),
  }));
  const entries = [];
  for (const g of DEMO_GOALS) {
    const last = g.endDate !== null && g.endDate < DEMO_TODAY ? g.endDate : addDays(DEMO_TODAY, -1);
    for (let date = g.startDate; date <= last; date = addDays(date, 1)) {
      const minutes = demoMinutes(g.id, date);
      if (minutes === null) continue;
      entries.push({ id: entryId(g.id, date), goalId: g.id, date, minutes, note: '', source: 'manual', createdAt: `${date}T13:00:00.000Z`, updatedAt: `${date}T13:00:00.000Z` });
    }
    const today = TODAY_ENTRIES[g.id];
    if (today && (g.endDate === null || g.endDate >= DEMO_TODAY) && g.startDate <= DEMO_TODAY) {
      entries.push({ id: entryId(g.id, DEMO_TODAY), goalId: g.id, date: DEMO_TODAY, minutes: today.minutes, note: today.note[locale], source: 'manual', createdAt: `${DEMO_TODAY}T12:00:00.000Z`, updatedAt: `${DEMO_TODAY}T12:00:00.000Z` });
    }
  }
  return {
    app: 'one-percent-better',
    schemaVersion: 1,
    exportedAt: DEMO_EXPORTED_AT,
    goals,
    entries,
    settings: { reminderEnabled: false, reminderTime: '20:00', lastReminderDate: null, lastBackupAt: DEMO_LAST_BACKUP_AT, plusOneShown: {} },
  };
}

function main() {
  mkdirSync(OUT, { recursive: true });
  for (const locale of ['en', 'vi']) {
    const file = join(OUT, `demo-${locale}.json`);
    writeFileSync(file, `${JSON.stringify(buildDemoBackup(locale), null, 2)}\n`);
    console.log(`wrote ${file}`);
  }
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) main();
