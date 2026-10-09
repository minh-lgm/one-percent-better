// Generates e2e/fixtures/large-backup.json for the NFR-03 benchmark (M4-T3):
// 5 goals × ~3 years (2023-10-10 → 2026-10-09), ≈ 5 500 entries, well under 5 MB.
// Deterministic (seeded PRNG) so the fixture is reproducible: `node scripts/gen-large-backup.mjs`.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const START = '2023-10-10';
const END = '2026-10-09';
const OUT = fileURLToPath(new URL('../e2e/fixtures/large-backup.json', import.meta.url));

let seed = 20261009;
const rand = () => {
  // mulberry32
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const days = [];
for (let d = new Date(2023, 9, 10); iso(d) <= END; d.setDate(d.getDate() + 1)) days.push(iso(d));

const stamp = '2023-10-09T01:00:00.000Z';
const goals = [
  { id: 'L1', name: 'Read', why: 'Books, every day', targetType: 'daily', targetMinutes: 30, startDate: START, endDate: END, archived: false, createdAt: stamp, updatedAt: stamp },
  { id: 'L2', name: 'Guitar', why: '', targetType: 'daily', targetMinutes: 20, startDate: START, endDate: END, archived: false, createdAt: stamp, updatedAt: stamp },
  { id: 'L3', name: 'Spanish', why: 'Talk with family', targetType: 'total', targetMinutes: 60000, startDate: START, endDate: END, archived: false, createdAt: stamp, updatedAt: stamp },
  { id: 'L4', name: 'Running', why: '', targetType: 'daily', targetMinutes: 45, startDate: START, endDate: END, archived: false, createdAt: stamp, updatedAt: stamp },
  { id: 'L5', name: 'Meditation', why: 'Calm', targetType: 'daily', targetMinutes: 10, startDate: START, endDate: END, archived: false, createdAt: stamp, updatedAt: stamp },
];

const entries = [];
let n = 0;
for (const date of days) {
  for (const g of goals) {
    // ≈ 1 entry per goal per day (skip ~0.5 %), minutes around the target.
    if (rand() < 0.005) continue;
    const target = g.targetType === 'daily' ? g.targetMinutes : 55;
    const minutes = Math.max(1, Math.round(target * (0.6 + rand() * 0.9)));
    n++;
    entries.push({ id: `L-${n}`, goalId: g.id, date, minutes, note: n % 7 === 0 ? 'Session' : '', source: n % 5 === 0 ? 'timer' : 'manual', createdAt: `${date}T12:00:00.000Z`, updatedAt: `${date}T12:00:00.000Z` });
  }
}

const file = {
  app: 'one-percent-better',
  schemaVersion: 1,
  exportedAt: '2026-10-09T03:00:00.000Z',
  goals,
  entries,
  settings: { reminderEnabled: false, reminderTime: '20:00', lastReminderDate: null, lastBackupAt: '2026-10-09T03:00:00.000Z', plusOneShown: {} },
};
const json = JSON.stringify(file);
writeFileSync(OUT, json + '\n');
console.log(`${OUT}: ${goals.length} goals, ${entries.length} entries, ${(Buffer.byteLength(json) / 1024 / 1024).toFixed(2)} MB`);
