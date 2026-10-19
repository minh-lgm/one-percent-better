// QC M11 round 1 - exploratory probe of extreme start dates for open-ended goals (A-49: no limit on how far back it starts).
import { describe, expect, it } from 'vitest';
import { curve, curveYScale } from '../../src/domain/curve';
import { goalStats } from '../../src/domain/stats';
import { buildGoal } from '../../src/test/builders';

const TODAY = '2026-10-09';

describe('M11 r1 probe: open-ended goal with a very old start date', () => {
  for (const start of ['2000-01-01', '1926-01-01', '1900-01-01', '1800-01-01', '1000-01-01', '0001-01-01']) {
    // M11-D1 (Minor, open): before ~1830 the ideal factor 1.01^days overflows to Infinity (ideal "+∞%", NaN axis domain).
    const knownBad = start <= '1830-01-01';
    (knownBad ? it.fails : it)(`start ${start}: curve + stats stay finite${knownBad ? ' (M11-D1 known defect)' : ''}`, () => {
      const g = buildGoal({ id: 'p', targetType: 'daily', targetMinutes: 10, startDate: start, endDate: null });
      const t0 = performance.now();
      const c = curve(g, [], TODAY);
      const ms = performance.now() - t0;
      const s = goalStats(g, [], 2026, TODAY);
      const ys = curveYScale(c.ideal.map((p) => (p.value - 1) * 100), c.actual.map((p) => p.percent));
      console.log(`[probe] start ${start}: ideal ${c.ideal.length} pts, ${ms.toFixed(0)} ms, idealPercent ${c.idealPercent}, factor ${c.idealFactor}, y domain ${JSON.stringify(ys.domain)}, ticks ${ys.ticks.length}, progress ${s.progressPercent}`);
      expect(Number.isFinite(c.idealPercent), `idealPercent ${c.idealPercent}`).toBe(true);
      expect(ys.domain.every(Number.isFinite), `domain ${JSON.stringify(ys.domain)}`).toBe(true);
    });
  }
});
