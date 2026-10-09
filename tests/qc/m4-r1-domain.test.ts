// QC round 1 (M4): independent oracle for stats / heatmap / series. The oracle below is written
// from the ARCH §4 rules with plain Date arithmetic (UTC) and brute force; it shares no code with
// src/domain/stats.ts or heatmap.ts. Randomised datasets cross year and leap-day boundaries.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildHeatmap } from '../../src/domain/heatmap';
import { goalStats, monthlySeries, overallStats, weeklySeries } from '../../src/domain/stats';
import type { Goal, LogEntry } from '../../src/domain/types';
import { availableYears, StatsService } from '../../src/services/stats-service';

// ---------- oracle ----------
const D = (s: string) => new Date(`${s}T00:00:00Z`);
const S = (d: Date) => d.toISOString().slice(0, 10);
const add = (s: string, n: number) => S(new Date(D(s).getTime() + n * 86_400_000));
const diff = (a: string, b: string) => Math.round((D(b).getTime() - D(a).getTime()) / 86_400_000);

function dailyOf(g: Goal): number {
  return g.targetType === 'daily' ? g.targetMinutes : Math.ceil(g.targetMinutes / (diff(g.startDate, g.endDate) + 1));
}
function minutesOf(entries: LogEntry[], goalId: string | null, date: string): number {
  return entries.filter((e) => e.date === date && (goalId === null || e.goalId === goalId)).reduce((a, e) => a + e.minutes, 0);
}
function metOnGoal(g: Goal, entries: LogEntry[], date: string): boolean {
  if (date < g.startDate || date > g.endDate) return false;
  const m = minutesOf(entries, g.id, date);
  return m > 0 && m >= dailyOf(g);
}
function runs(isMet: (d: string) => boolean, from: string, to: string, today: string) {
  let longest = 0;
  let run = 0;
  for (let d = from; d <= to; d = add(d, 1)) {
    if (isMet(d)) {
      run++;
      longest = Math.max(longest, run);
    } else run = 0;
  }
  let cur = 0;
  let d = isMet(today) ? today : add(today, -1);
  while (d >= from && isMet(d)) {
    cur++;
    d = add(d, -1);
  }
  return { cur, longest };
}

// ---------- random data ----------
function rng(seed: number) {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}
function randomData(seed: number, today: string) {
  const r = rng(seed);
  const pick = (n: number) => Math.floor(r() * n);
  const goals: Goal[] = [];
  const entries: LogEntry[] = [];
  const n = 1 + pick(4);
  for (let i = 0; i < n; i++) {
    const start = add(today, -pick(900));
    const end = add(start, 5 + pick(700));
    const daily = r() < 0.6;
    const g: Goal = {
      id: `g${i}`,
      name: `G${i}`,
      why: '',
      targetType: daily ? 'daily' : 'total',
      targetMinutes: daily ? 5 + pick(90) : 60 * (5 + pick(200)),
      startDate: start,
      endDate: end,
      archived: false,
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    };
    if (dailyOf(g) > 1440) g.targetMinutes = 60;
    goals.push(g);
    const hit = 0.4 + r() * 0.5;
    for (let d = start; d <= end && d <= today; d = add(d, 1)) {
      if (r() < hit) {
        const t = dailyOf(g);
        const m = r() < 0.6 ? t + pick(30) : Math.max(1, Math.floor(t * r()));
        entries.push({ id: `${g.id}-${d}`, goalId: g.id, date: d, minutes: Math.min(m, 700), note: '', source: 'manual', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' });
      }
    }
  }
  return { goals, entries };
}

const TODAYS = ['2026-10-09', '2028-02-29', '2027-01-01', '2025-12-31', '2024-03-01', '2026-01-01'];

describe('M4 QC oracle: per-goal and overall stats on random datasets (year/leap boundaries)', () => {
  for (const today of TODAYS) {
    for (let seed = 1; seed <= 12; seed++) {
      it(`today ${today} seed ${seed}`, () => {
        const { goals, entries } = randomData(seed * 7919 + Number(today.slice(0, 4)), today);
        const years = [Number(today.slice(0, 4)), Number(today.slice(0, 4)) - 1];
        const earliest = goals.map((g) => g.startDate).sort()[0];
        for (const year of years) {
          const isMetAny = (d: string) => goals.some((g) => metOnGoal(g, entries, d));
          const o = runs(isMetAny, earliest, today, today);
          const os = overallStats(goals, entries, year, today);
          expect({ c: os.currentStreak, l: os.longestStreak }, `overall streak ${year}`).toEqual({ c: o.cur, l: o.longest });
          let days = 0;
          let logged = 0;
          let minutes = 0;
          for (let d = `${year}-01-01`; d <= `${year}-12-31`; d = add(d, 1)) {
            if (isMetAny(d)) days++;
            const m = minutesOf(entries, null, d);
            if (m > 0) logged++;
            minutes += m;
          }
          expect({ days: os.daysOnTarget, logged: os.daysLogged, minutes: os.minutesInYear }, `overall counters ${year}`).toEqual({ days, logged, minutes });

          for (const g of goals) {
            const ge = entries.filter((e) => e.goalId === g.id);
            const s = goalStats(g, ge, year, today);
            const r = runs((d) => metOnGoal(g, entries, d), g.startDate, g.endDate > today ? today : g.endDate, today);
            expect({ c: s.currentStreak, l: s.longestStreak }, `${g.id} streak`).toEqual({ c: r.cur, l: r.longest });
            const total = ge.reduce((a, e) => a + e.minutes, 0);
            const totalTarget = g.targetType === 'daily' ? g.targetMinutes * (diff(g.startDate, g.endDate) + 1) : g.targetMinutes;
            expect(s.minutesTotal).toBe(total);
            expect(s.totalTarget).toBe(totalTarget);
            expect(s.progressPercent).toBeCloseTo(Math.round((total / totalTarget) * 1000) / 10, 9);
            const elapsed = today < g.startDate ? 0 : diff(g.startDate, today < g.endDate ? today : g.endDate) + 1;
            expect(s.elapsedDays).toBe(elapsed);
            expect(s.pace).toBe(elapsed === 0 ? 0 : total - dailyOf(g) * elapsed);
            const inYear = ge.filter((e) => e.date.startsWith(`${year}-`));
            expect(s.minutesInYear).toBe(inYear.reduce((a, e) => a + e.minutes, 0));
          }
        }
      });
    }
  }
});

describe('M4 QC oracle: heatmap grid and levels', () => {
  for (const today of ['2026-10-09', '2028-02-29', '2025-01-01']) {
    for (const seed of [3, 4, 5]) {
      it(`today ${today} seed ${seed}: every cell vs brute force (All goals and each goal)`, () => {
        const { goals, entries } = randomData(seed * 31, today);
        const ty = Number(today.slice(0, 4));
        for (const year of [ty, ty - 1, ty - 2]) {
          for (const goal of [null, ...goals]) {
            const grid = buildHeatmap({ year, goal, goals, entries, today });
            const leap = new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1;
            expect(grid.cells.length).toBe(leap ? 366 : 365);
            const jan1Row = (new Date(Date.UTC(year, 0, 1)).getUTCDay() + 6) % 7;
            expect(grid.columns).toBe(Math.ceil((jan1Row + grid.cells.length) / 7));
            grid.cells.forEach((c, i) => {
              const date = add(`${year}-01-01`, i);
              expect(c.date).toBe(date);
              expect(c.row).toBe((jan1Row + i) % 7);
              expect(c.col).toBe(Math.floor((jan1Row + i) / 7));
              expect(c.today).toBe(date === today);
              if (date > today) return expect(c.state).toBe('future');
              if (goal && (date < goal.startDate || date > goal.endDate)) return expect(c.state).toBe('outside');
              const m = minutesOf(entries, goal ? goal.id : null, date);
              expect(c.minutes).toBe(m);
              expect(c.state).toBe(m > 0 ? 'logged' : 'none');
              let level = 0;
              if (m > 0) {
                if (goal) {
                  const share = m / dailyOf(goal);
                  level = share < 0.5 ? 1 : share < 1 ? 2 : share < 2 ? 3 : 4;
                } else level = m < 30 ? 1 : m < 60 ? 2 : m < 120 ? 3 : 4;
              }
              expect(c.level, `${date} ${goal?.id ?? 'all'} ${m}`).toBe(level);
              const met = goal ? metOnGoal(goal, entries, date) : goals.some((g) => metOnGoal(g, entries, date));
              expect(c.met).toBe(met);
            });
          }
        }
      });
    }
  }
});

describe('M4 QC oracle: weekly / monthly series', () => {
  it('12 ISO weeks ending with the current week and 12 months match brute force', () => {
    for (const today of TODAYS) {
      const { entries } = randomData(99, today);
      const dow = (D(today).getUTCDay() + 6) % 7;
      const monday = add(today, -dow);
      const w = weeklySeries(entries, today);
      expect(w).toHaveLength(12);
      w.forEach((p, i) => {
        const start = add(monday, -7 * (11 - i));
        expect(p.start).toBe(start);
        expect(p.end).toBe(add(start, 6));
        const sum = entries.filter((e) => e.date >= start && e.date <= add(start, 6) && e.date <= today).reduce((a, e) => a + e.minutes, 0);
        expect(p.minutes, `${today} week ${start}`).toBe(sum);
        expect(p.current).toBe(i === 11);
      });
      const year = Number(today.slice(0, 4));
      const m = monthlySeries(entries, year, today);
      expect(m).toHaveLength(12);
      m.forEach((p, i) => {
        const prefix = `${year}-${String(i + 1).padStart(2, '0')}-`;
        expect(p.minutes).toBe(entries.filter((e) => e.date.startsWith(prefix) && e.date <= today).reduce((a, e) => a + e.minutes, 0));
      });
    }
  });
});

describe('M4 QC: S1 numbers from the fixture file', () => {
  it('All goals + each goal at 2026-10-09 equal the TASKS / mockup oracle numbers', () => {
    const sample = JSON.parse(readFileSync(new URL('../../e2e/fixtures/sample-backup.json', import.meta.url), 'utf8')) as { goals: Goal[]; entries: LogEntry[] };
    const today = '2026-10-09';
    const all = StatsService.allGoalStats({ goals: sample.goals, entries: sample.entries }, 2026, today);
    expect(all.get('g1')).toMatchObject({ minutesInYear: 240, minutesTotal: 240, totalTarget: 930, progressPercent: 25.8, pace: -30, currentStreak: 8, longestStreak: 8, daysOnTarget: 8 });
    expect(all.get('g2')).toMatchObject({ minutesTotal: 250, progressPercent: 10.2, pace: -530, currentStreak: 2, longestStreak: 10 });
    expect(all.get('g3')).toMatchObject({ minutesTotal: 60, progressPercent: 1, pace: -4734 });
    expect(all.get('g4')).toMatchObject({ minutesTotal: 0, pace: 0 });
    const o = overallStats(sample.goals, sample.entries, 2026, today);
    expect(o).toMatchObject({ currentStreak: 8, longestStreak: 10, daysOnTarget: 20, daysLogged: 21 });
    expect(availableYears(sample.goals, sample.entries, 2026)).toEqual([2026]);
  });
});

describe('M4 QC exploratory: archived goals', () => {
  const base: Goal = {
    id: 'a',
    name: 'Archived upcoming',
    why: '',
    targetType: 'daily',
    targetMinutes: 45,
    startDate: '2026-11-01',
    endDate: '2026-11-30',
    archived: true,
    createdAt: '2026-09-30T01:00:00.000Z',
    updatedAt: '2026-09-30T01:00:00.000Z',
  };
  // M4-D1 (open). it.fails keeps the suite green while the defect is open; remove `.fails` once fixed.
  it.fails('an archived goal that has not started yet has no elapsed days and pace 0 (same as an upcoming one)', () => {
    const today = '2026-10-09';
    const upcoming = goalStats({ ...base, archived: false }, [], 2026, today);
    const archived = goalStats(base, [], 2026, today);
    expect(upcoming.pace).toBe(0);
    expect(archived.elapsedDays, 'elapsed days of an archived, not-yet-started goal').toBe(0);
    expect(archived.pace, 'pace of an archived, not-yet-started goal').toBe(0);
  });
  it('an archived goal in progress and an archived ended goal use the same elapsed days as non-archived', () => {
    const today = '2026-10-09';
    const running = { ...base, startDate: '2026-10-01', endDate: '2026-10-31' };
    expect(goalStats(running, [], 2026, today).elapsedDays).toBe(goalStats({ ...running, archived: false }, [], 2026, today).elapsedDays);
    const ended = { ...base, startDate: '2026-01-01', endDate: '2026-06-30' };
    expect(goalStats(ended, [], 2026, today).elapsedDays).toBe(181);
  });
});
