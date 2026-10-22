// QC M15 r1 (re-targeted r2 for M15-D2: second precision) — planReminderDates / reminderDateTime against an independent oracle (seeded fuzz + hand cases),
// run under several process time zones (QC_TZ=America/New_York npx vitest run tests/qc/m15-r1-plan.test.ts).
import { describe, expect, it } from 'vitest';
import { planReminderDates, reminderDateTime } from '../../src/domain/reminder-plan';
import type { Goal } from '../../src/domain/types';

// Node on Windows ignores TZ at start-up but honours a runtime assignment: QC_TZ=America/New_York selects the zone.
if (process.env.QC_TZ) process.env.TZ = process.env.QC_TZ;

const iso = (y: number, m: number, d: number) => `${String(y).padStart(4, '0')}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
/** Calendar arithmetic without Date-in-local-zone traps. */
const plus = (date: string, n: number) => {
  const t = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10) + n));
  return t.toISOString().slice(0, 10);
};
const goal = (id: string, start: string, end: string | null, extra: Partial<Goal> = {}): Goal => ({
  id, name: id, why: '', targetType: 'daily', targetMinutes: 10, startDate: start, endDate: end, archived: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...extra,
});

function oracle(args: { nowParts: [number, number, number, number, number, number]; enabled: boolean; time: string; goals: Goal[]; progress: Array<{ id: string; current: number; target: number }>; days: number }): string[] {
  if (!args.enabled) return [];
  const m = /^(\d\d):(\d\d)$/.exec(args.time);
  if (!m) return [];
  const t = +m[1] * 60 + +m[2];
  const [y, mo, d, h, mi, sec] = args.nowParts;
  const today = iso(y, mo, d);
  const active = (g: Goal, day: string) => !g.archived && day >= g.startDate && (g.endDate === null || day <= g.endDate);
  const out: string[] = [];
  for (let i = 0; i < args.days; i += 1) {
    const day = plus(today, i);
    if (!args.goals.some((g) => active(g, day))) continue;
    if (i === 0) {
      // M15-D2 (r2): today's reminder instant must not be in the past; exactly hh:mm:00.000 still counts as 'not past'.
      if (h * 60 + mi > t || (h * 60 + mi === t && sec > 0)) continue;
      const allDone = args.goals.filter((g) => active(g, today)).every((g) => {
        const p = args.progress.find((x) => x.id === g.id);
        return p !== undefined && p.current >= p.target;
      });
      if (allDone) continue;
    }
    out.push(day);
  }
  return out;
}

// Small seeded PRNG so a failure is reproducible.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

describe('M15 QC — planReminderDates vs oracle', () => {
  it('seeded fuzz (3000 cases)', () => {
    const r = rng(20261022);
    const pick = (n: number) => Math.floor(r() * n);
    for (let c = 0; c < 3000; c += 1) {
      const y = 2026;
      const mo = pick(12);
      const d = 1 + pick(28);
      const h = pick(24);
      const mi = pick(60);
      const sec = pick(60);
      const today = iso(y, mo, d);
      const goals: Goal[] = [];
      const n = pick(5);
      for (let k = 0; k < n; k += 1) {
        const start = plus(today, pick(40) - 20);
        const end = r() < 0.3 ? null : plus(start, pick(30));
        goals.push(goal(`g${k}`, start, end, { archived: r() < 0.15 }));
      }
      const progress = goals.map((g) => ({ id: g.id, name: g.name, current: pick(3) === 0 ? 0 : 10, target: 10 })).filter(() => r() < 0.9);
      const time = `${String(pick(24)).padStart(2, '0')}:${String(pick(60)).padStart(2, '0')}`;
      const enabled = r() < 0.9;
      const days = r() < 0.8 ? 14 : 1 + pick(20);
      const now = new Date(y, mo, d, h, mi, sec, 0);
      const got = planReminderDates({ now, reminderEnabled: enabled, reminderTime: time, goals, todayProgress: progress, days });
      const want = oracle({ nowParts: [y, mo, d, h, mi, sec], enabled, time, goals, progress, days });
      expect(got, `case ${c} ${now.toString()} ${time} ${JSON.stringify(goals.map((g) => [g.startDate, g.endDate, g.archived]))}`).toEqual(want);
    }
  });

  it('hand cases (AC1) in the process time zone', () => {
    const G = [goal('g1', '2026-10-01', '2026-12-31'), goal('g2', '2026-10-01', '2026-12-31')];
    const none: never[] = [];
    const at = (h: number, m: number, s = 0, day = 9) => new Date(2026, 9, day, h, m, s);
    const plan = (now: Date, extra: Partial<Parameters<typeof planReminderDates>[0]> = {}) => planReminderDates({ now, reminderEnabled: true, reminderTime: '20:00', goals: G, todayProgress: none, ...extra });
    expect(plan(at(10, 0))).toHaveLength(14);
    expect(plan(at(10, 0))[0]).toBe('2026-10-09');
    expect(plan(at(10, 0)).at(-1)).toBe('2026-10-22');
    expect(plan(at(20, 0, 0))[0]).toBe('2026-10-09');
    // M15-D2 (r2): second precision. 19:59:59 and 20:00:00 keep today; 20:00:01 .. 20:01:00 start tomorrow.
    expect(plan(at(19, 59, 59))[0]).toBe('2026-10-09');
    expect(plan(at(20, 0, 0))[0]).toBe('2026-10-09');
    for (const [h, m, s] of [[20, 0, 1], [20, 0, 30], [20, 0, 59], [20, 1, 0]] as const) {
      expect(plan(at(h, m, s))[0], `${h}:${m}:${s}`).toBe('2026-10-10');
      expect(plan(at(h, m, s))).toHaveLength(13);
    }
    // 20:00:00.001 is already past; 19:59:59.999 is not
    expect(plan(new Date(2026, 9, 9, 20, 0, 0, 1))[0]).toBe('2026-10-10');
    expect(plan(new Date(2026, 9, 9, 19, 59, 59, 999))[0]).toBe('2026-10-09');
    // invariant: no planned instant is earlier than now (the iOS plugin would fire it immediately)
    for (let sec = 0; sec < 3600; sec += 7) {
      const now = new Date(2026, 9, 9, 19, 30, 0).getTime() + sec * 1000;
      const nowD = new Date(now);
      for (const date of plan(nowD)) expect(reminderDateTime(date, '20:00').getTime(), `${nowD.toString()} ${date}`).toBeGreaterThanOrEqual(now);
    }
    expect(plan(at(20, 1))[0]).toBe('2026-10-10');
    expect(plan(at(20, 1))).toHaveLength(13);
    // year / month boundary and midnight edges
    expect(plan(at(23, 59, 59, 31)).length).toBe(13);
    expect(plan(new Date(2026, 11, 31, 0, 0, 0), { goals: [goal('g', '2026-01-01', null)] })[0]).toBe('2026-12-31');
    expect(plan(new Date(2026, 11, 31, 0, 0, 0), { goals: [goal('g', '2026-01-01', null)] }).at(-1)).toBe('2027-01-13');
    // leap day 2028
    expect(planReminderDates({ now: new Date(2028, 1, 27, 9, 0), reminderEnabled: true, reminderTime: '20:00', goals: [goal('g', '2028-01-01', null)], todayProgress: [], days: 4 })).toEqual(['2028-02-27', '2028-02-28', '2028-02-29', '2028-03-01']);
    // malformed time / disabled
    for (const bad of ['', '8:00', '24:00', '20:60', 'ab:cd', '20:00 ']) expect(plan(at(10, 0), { reminderTime: bad })).toEqual([]);
    expect(plan(at(10, 0), { reminderEnabled: false })).toEqual([]);
    // no goals / only archived / only ended
    expect(plan(at(10, 0), { goals: [] })).toEqual([]);
    expect(plan(at(10, 0), { goals: [goal('a', '2026-01-01', null, { archived: true })] })).toEqual([]);
    expect(plan(at(10, 0), { goals: [goal('e', '2026-01-01', '2026-10-08')] })).toEqual([]);
    // all reached today -> from tomorrow; one short by 1 minute -> today kept
    const reached = [{ id: 'g1', name: 'g1', current: 10, target: 10 }, { id: 'g2', name: 'g2', current: 10, target: 10 }];
    expect(plan(at(10, 0), { todayProgress: reached })[0]).toBe('2026-10-10');
    expect(plan(at(10, 0), { todayProgress: [reached[0], { ...reached[1], current: 9 }] })[0]).toBe('2026-10-09');
    // total goals: a goal with no progress item counts as not reached
    expect(plan(at(10, 0), { todayProgress: [reached[0]] })[0]).toBe('2026-10-09');
    // days = 0 / negative
    expect(plan(at(10, 0), { days: 0 })).toEqual([]);
    expect(plan(at(10, 0), { days: -3 })).toEqual([]);
  });

  it('reminderDateTime: local wall clock on the right calendar day (also across DST in the process zone)', () => {
    // Walk a whole year of dates: the Date must be on the given ISO day with the asked wall time, except for the
    // non-existent hour of a spring-forward day where JS moves it forward (still the same day).
    for (let i = 0; i < 366; i += 1) {
      const day = plus('2026-01-01', i);
      for (const time of ['00:00', '00:30', '02:30', '12:00', '20:00', '23:59']) {
        const dt = reminderDateTime(day, time);
        const local = iso(dt.getFullYear(), dt.getMonth(), dt.getDate());
        expect(local, `${day} ${time}`).toBe(day);
        const [hh, mm] = time.split(':').map(Number);
        const same = dt.getHours() === hh && dt.getMinutes() === mm;
        const springForward = dt.getHours() === hh + 1 && dt.getMinutes() === mm; // the skipped hour
        expect(same || springForward, `${day} ${time} -> ${dt.toString()}`).toBe(true);
      }
    }
  });

  it('the 14 planned notifications are strictly increasing instants and never in the past (apart from the same-minute case)', () => {
    const G = [goal('g', '2026-01-01', null)];
    for (const tz of [0]) {
      void tz;
      for (const [h, mi, s] of [[0, 0, 0], [8, 15, 30], [19, 59, 59], [20, 0, 0], [20, 0, 45], [23, 59, 59]] as const) {
        const now = new Date(2026, 2, 7, h, mi, s); // eve of the US spring-forward Sunday
        const dates = planReminderDates({ now, reminderEnabled: true, reminderTime: '20:00', goals: G, todayProgress: [] });
        const ats = dates.map((d) => reminderDateTime(d, '20:00').getTime());
        for (let i = 1; i < ats.length; i += 1) expect(ats[i]).toBeGreaterThan(ats[i - 1]);
        // At 20:00:45 the plan keeps today (minutes equal) although the instant 20:00:00 has passed: documented in the report (M15-D1).
        if (!(h === 20 && mi === 0 && s > 0)) for (const a of ats) expect(a).toBeGreaterThanOrEqual(now.getTime());
      }
    }
  });
});
