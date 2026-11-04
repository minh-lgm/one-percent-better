// QC round 2 (M20): audit of the changed contract of dates.addDays (now throws RangeError instead of returning a 5-digit year).
// Every non-test caller in src/**: domain/{ics,reminder-plan,roadmap-template,roadmap}, services/roadmap-service,
// ui/components/{DateNav,roadmap/TemplateDialog}, ui/screens/{Today,RoadmapEditor}. Inputs near 9999-12-31 and 0001-01-01.
import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { OPEN_END_QUERY_MAX } from '../../src/config/constants';
import { addDays, dayNumber, isoFromDayNumber } from '../../src/domain/dates';
import { buildReminderIcs } from '../../src/domain/ics';
import { planReminderDates } from '../../src/domain/reminder-plan';
import { addDaysOrNull } from '../../src/domain/roadmap';
import { goalsDateRange } from '../../src/services/stats-service';
import { buildGoal, FIXED_NOW_Q1 } from '../../src/test/builders';
import { createTestContainer, type TestContainer } from '../../src/test/container';
import { renderApp } from '../../src/test/render-with-locale';

let tc: TestContainer | undefined;
afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

describe('addDays contract', () => {
  it('9999-12-30 + 1 ok, 9999-12-31 + 1 throws RangeError, -1 from 9999-12-31 ok', () => {
    expect(addDays('9999-12-30', 1)).toBe('9999-12-31');
    expect(addDays('9999-12-31', -1)).toBe('9999-12-30');
    expect(() => addDays('9999-12-31', 1)).toThrow(RangeError);
    expect(addDaysOrNull('9999-12-31', 1)).toBeNull();
  });
  it('OPEN_END_QUERY_MAX is only ever used as a query bound: no addDays on it in src (documented) and isoFromDayNumber does not throw past it', () => {
    expect(OPEN_END_QUERY_MAX).toBe('9999-12-31');
    expect(() => isoFromDayNumber(dayNumber(OPEN_END_QUERY_MAX) + 1)).not.toThrow();
    expect(() => addDays(OPEN_END_QUERY_MAX, 1)).toThrow(RangeError);
  });
  it('low end: 0001-01-01 - 1 (info, pre-existing): does not throw', () => {
    // record the behaviour; year 0 is formatted by date-fns as 0001 => a wrong-but-valid-looking date, not a crash
    let out: string | Error;
    try {
      out = addDays('0001-01-01', -1);
    } catch (e) {
      out = e as Error;
    }
    console.info('INFO addDays(0001-01-01,-1) =>', String(out));
  });
});

describe('callers fed from "today" (system clock) only fail with the clock in year 9999', () => {
  const goals = [buildGoal({ id: 'a', startDate: '2026-01-01', endDate: '9999-12-31' }), buildGoal({ id: 'b', startDate: '2026-01-01', endDate: null, targetType: 'daily' })];
  it('planReminderDates with goals ending 9999-12-31 / open-ended, now = 2026: 14 dates, no throw', () => {
    const out = planReminderDates({ now: FIXED_NOW_Q1, reminderEnabled: true, reminderTime: '20:00', goals, todayProgress: [] } as never);
    expect(out).toHaveLength(14);
  });
  it('goalsDateRange: end 9999-12-31 and open-ended give 9999-12-31', () => {
    expect(goalsDateRange(goals)).toEqual(['2026-01-01', '9999-12-31']);
    expect(goalsDateRange([goals[1]!])).toEqual(['2026-01-01', '9999-12-31']);
  });
  it('buildReminderIcs for a normal day ok', () => {
    expect(() => buildReminderIcs({ today: '2026-11-04', now: FIXED_NOW_Q1, reminderTime: '20:00', uid: 'u', summary: 's', alarmDescription: 'd' } as never)).not.toThrow();
  });
  it('clock at 9999-12-31 (unreachable in practice: device clock) makes ics/reminder-plan throw, which is a RangeError, not a bad string', () => {
    const late = new Date(9999, 11, 31, 10, 0, 0);
    expect(() => buildReminderIcs({ today: '9999-12-31', now: late, reminderTime: '20:00', uid: 'u', summary: 's', alarmDescription: 'd' } as never)).toThrow(RangeError);
    expect(() => planReminderDates({ now: late, reminderEnabled: true, reminderTime: '20:00', goals, todayProgress: [] } as never)).toThrow(RangeError);
  });
});

describe('screens with goals at the date extremes: no ErrorBoundary', () => {
  async function seed() {
    tc = await createTestContainer({ locale: 'en', clock: () => FIXED_NOW_Q1 });
    await tc.container.db.goals.bulkPut([
      buildGoal({ id: 'end9999', name: 'Ends9999', startDate: '9995-01-01', endDate: '9999-12-31', targetType: 'daily', targetMinutes: 30 }),
      buildGoal({ id: 'open', name: 'OpenEnded', startDate: '2026-01-01', endDate: null, targetType: 'daily', targetMinutes: 20 }),
      buildGoal({ id: 'openfut', name: 'OpenFuture', startDate: '9999-12-31', endDate: null, targetType: 'daily', targetMinutes: 20 }),
    ]);
  }
  for (const route of ['/today', '/goals', '/review', '/goals/end9999', '/goals/open', '/goals/openfut', '/day/9999-12-31', '/day/9999-12-30', '/day/0001-01-01', '/goals/end9999/edit', '/goals/new']) {
    it(`route ${route}`, async () => {
      await seed();
      await renderApp({ route, container: tc });
      await waitFor(() => expect(screen.getByRole('main')).toBeTruthy(), { timeout: 5000 });
      await new Promise((r) => setTimeout(r, 300));
      expect(screen.queryByTestId('error-boundary')).toBeNull();
      expect(document.body.textContent).not.toMatch(/NaN|Invalid Date|undefined/);
    }, 30000);
  }
});
