// NFR-26 (M17): overview + hours of every item + checkpoint states for a roadmap of 200 items and 50 checkpoints
// with a goal of 5,500 entries must take < 50 ms. Timing is asserted only under `BENCH_ASSERT=1` (`npm run bench`),
// like the stats bench (M5-D2); the median is always logged for the handoff.
import { describe, expect, it } from 'vitest';
import { buildEntry, datasetQ1, TODAY_Q1 } from '../test/builders';
import { addDays } from './dates';
import type { RoadmapCheckpoint, RoadmapItem } from './roadmap';
import { checkpointState, roadmapView } from './roadmap-progress';
import type { LogEntry } from './types';

describe('roadmap-progress bench (NFR-26)', () => {
  it('200 items + 50 checkpoints + 5,500 entries: median of 7 runs < 50 ms (npm run bench)', () => {
    const d = datasetQ1();
    const items: RoadmapItem[] = Array.from({ length: 200 }, (_, k) => {
      const plannedStart = addDays('2022-01-03', k * 7);
      return { ...d.items[0], id: `i${k}`, phaseId: d.phases[k % 5].id, position: k, plannedStart, plannedEnd: addDays(plannedStart, 6), actualStart: k < 100 ? plannedStart : null, actualEnd: k < 99 ? addDays(plannedStart, 5) : null };
    });
    const checkpoints: RoadmapCheckpoint[] = Array.from({ length: 50 }, (_, k) => ({ ...d.checkpoints[2], id: `c${k}`, date: addDays('2022-01-09', k * 28), score: k % 3 === 0 ? null : 15 + (k % 17) }));
    const entries: LogEntry[] = Array.from({ length: 5500 }, (_, k) => buildEntry({ id: `e${k}`, goalId: 'gq', date: addDays('2021-12-01', Math.floor(k / 4)), minutes: 10 + (k % 50) }));
    const aggregate = { roadmap: d.roadmap, phases: d.phases, items, checkpoints };
    const goal = d.goals.find((g) => g.id === 'gq')!;
    const times: number[] = [];
    let last = 0;
    for (let run = 0; run < 7; run += 1) {
      const start = performance.now();
      const view = roadmapView(aggregate, goal, entries, TODAY_Q1);
      for (const c of view.checkpoints) checkpointState(c);
      last = view.hoursDoneMinutes ?? 0;
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    const median = times[3];
    console.log(`[bench NFR-26] roadmapView 200 items / 50 checkpoints / 5500 entries: median ${median.toFixed(1)} ms (min ${times[0].toFixed(1)} ms)`);
    expect(last).toBeGreaterThan(0);
    if (process.env.BENCH_ASSERT) expect(median).toBeLessThan(50);
    else expect(median).toBeLessThan(60_000);
  });
});
