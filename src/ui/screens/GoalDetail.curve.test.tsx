import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi as vitest } from 'vitest';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import { buildGoal, datasetS1 } from '../../test/builders';
import { createTestContainer, type TestContainer } from '../../test/container';
import { renderApp, scanVi } from '../../test/render-with-locale';

// The lazy Recharts curve is replaced by a stub (F-D1): this file tests the Goal detail
// screen (headline, summary, range, table, stats, archive); CurveChart.test.tsx tests the chart.
vitest.mock('../components/CurveChart', () => import('../../test/stubs/CurveChart'));

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

async function withS1(locale: 'en' | 'vi' = 'en') {
  tc = await createTestContainer({ locale });
  const { goals, entries } = datasetS1();
  await tc.container.db.goals.bulkPut([...goals, buildGoal({ id: 'g6', name: 'Stretch', why: '', targetMinutes: 5, startDate: '2026-10-01', endDate: '2026-10-31', createdAt: '2026-09-30T06:00:00.000Z', updatedAt: '2026-09-30T06:00:00.000Z' })]);
  await tc.container.db.entries.bulkPut(entries);
  return tc;
}

// Lazy route + live queries: allow more than the default when the suite runs in parallel.
const SLOW = { timeout: 8000 };
const norm = (s: string | null) => (s ?? '').replace(/[\u00A0\u202F]/g, ' ');

describe('Goal detail — 1% curve, stats, archive (M5-AC2, M5-AC4, M5-AC5, M5-AC12)', () => {
  it('Read (S1): headline +8.3% better, Day 9 of 31 · 8 days on target · 1.01^8 = 1.083, summary, legend, two series, stats, 8 history rows', async () => {
    await withS1();
    await renderApp({ route: '/goals/g1', container: tc });
    expect(await screen.findByRole('heading', { level: 1, name: 'Read' })).toBeInTheDocument();
    expect(screen.getByText('Be smarter')).toBeInTheDocument();
    expect(screen.getByText('30 min/day · 2026-10-01 – 2026-10-31')).toBeInTheDocument();
    expect(screen.getByText(en.goal.status.active)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent('+8.3% better'), SLOW);
    expect(screen.getByText(en.goal.detail.eyebrow)).toBeInTheDocument();
    expect(norm(screen.getByTestId('headline-sub').textContent)).toBe('Day 9 of 31 · 8 days on target · 1.01^8 = 1.083');
    expect(screen.getByRole('heading', { level: 2, name: en.goal.detail.chartTitle })).toBeInTheDocument();
    expect(screen.getByTestId('curve-summary')).toHaveTextContent('Day 9 of 31: you are +8.3% better. The ideal line is +9.4%. You hit your target on 8 of 9 days.');
    expect(screen.getByText(en.goal.detail.chartNote)).toBeInTheDocument();
    expect(within(screen.getByTestId('curve-legend')).getAllByRole('listitem').map((li) => li.textContent)).toEqual([en.goal.detail.legendIdeal, en.goal.detail.legendYou]);
    expect(screen.queryByTestId('curve-empty')).toBeNull();
    // Range: 31 days ≤ 120 → "Whole period" by default.
    expect(screen.getByRole('radio', { name: en.goal.detail.rangeWhole })).toBeChecked();
    expect(screen.getByRole('radio', { name: en.goal.detail.rangeSoFar })).not.toBeChecked();

    // The chart gets the whole ideal series (31) and the 9 actual points, with the summary as its name (stub).
    const chart = await screen.findByTestId('curve-chart', undefined, SLOW);
    expect(chart).toHaveAttribute('data-stub', 'curve-chart');
    expect(chart).toHaveAttribute('role', 'img');
    expect(chart).toHaveAccessibleName('Day 9 of 31: you are +8.3% better. The ideal line is +9.4%. You hit your target on 8 of 9 days.');
    expect(chart).toHaveAttribute('data-ideal', '31');
    expect(chart).toHaveAttribute('data-actual', '9');
    expect(screen.getByRole('figure', { name: en.goal.detail.chartCaption })).toBeInTheDocument();

    // Stats (M4 rules): progress 25.8 %, 30 min behind, streak 8/8.
    expect(screen.getByTestId('stat-progress')).toHaveTextContent('25.8%');
    expect(screen.getByTestId('stat-progress')).toHaveTextContent('240 of 930 min');
    expect(within(screen.getByTestId('stat-progress')).getByRole('progressbar', { name: en.stat.progress })).toHaveAttribute('aria-valuenow', '25.8');
    expect(screen.getByTestId('stat-pace')).toHaveTextContent('30 min behind');
    expect(screen.getByTestId('stat-pace')).toHaveTextContent('Expected 270 min by today');
    expect(screen.getByTestId('stat-current')).toHaveTextContent('8 days');
    expect(screen.getByTestId('stat-longest')).toHaveTextContent('8 days');
    expect(screen.getAllByTestId('history-row')).toHaveLength(8);
    expect(screen.getByRole('button', { name: en.goals.archive })).toBeInTheDocument();
  });

  it('data table: closed by default, opens with 31 rows (ideal for every day, "—" for days not yet reached); "So far" cuts both to 9', async () => {
    const user = userEvent.setup();
    await withS1();
    await renderApp({ route: '/goals/g1', container: tc });
    await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent('+8.3% better'), SLOW);
    expect(screen.queryByTestId('curve-table')).toBeNull();
    const details = screen.getByText(en.goal.detail.showTable).closest('details')!;
    await user.click(screen.getByText(en.goal.detail.showTable));
    if (!details.open) {
      details.open = true;
      fireEvent(details, new Event('toggle'));
    }
    const table = await screen.findByTestId('curve-table');
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([en.goal.detail.tableDate, en.goal.detail.tableIdeal, en.goal.detail.tableYou]);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(31);
    expect(within(rows[0]).getAllByRole('cell').map((c) => c.textContent)).toEqual(['+1.0%', '+1.0%']);
    expect(within(rows[0]).getByRole('rowheader')).toHaveTextContent('2026-10-01');
    expect(within(rows[8]).getAllByRole('cell').map((c) => c.textContent)).toEqual(['+9.4%', '+8.3%']);
    expect(within(rows[9]).getAllByRole('cell').map((c) => c.textContent)).toEqual(['+10.5%', '—']);
    expect(within(rows[30]).getAllByRole('cell')[0]).toHaveTextContent('+36.1%');

    await user.click(screen.getByRole('radio', { name: en.goal.detail.rangeSoFar }));
    await waitFor(() => expect(within(screen.getByTestId('curve-table')).getAllByRole('row').slice(1)).toHaveLength(9));
    expect(screen.getByRole('radio', { name: en.goal.detail.rangeSoFar })).toBeChecked();
    // The chart receives the same slice as the table.
    await waitFor(() => expect(screen.getByTestId('curve-chart')).toHaveAttribute('data-ideal', '9'));
    expect(screen.getByTestId('curve-chart')).toHaveAttribute('data-actual', '9');
  });

  it('a goal without entries: headline +0.0% better, "Your line starts rising…", empty history (M5-AC5)', async () => {
    await withS1();
    await renderApp({ route: '/goals/g6', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'Stretch' });
    await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent('+0.0% better'), SLOW);
    expect(norm(screen.getByTestId('headline-sub').textContent)).toBe('Day 9 of 31 · 0 days on target · 1.01^0 = 1.000');
    expect(screen.getByTestId('curve-empty')).toHaveTextContent(en.empty.detail.curve);
    expect(screen.getByTestId('curve-summary')).toHaveTextContent('Day 9 of 31: you are +0.0% better. The ideal line is +9.4%. You hit your target on 0 of 9 days.');
    expect(screen.getByRole('heading', { level: 3, name: en.empty.detail.history })).toBeInTheDocument();
    expect(screen.getByTestId('stat-current')).toHaveTextContent('0 days');
  });

  it('upcoming goal: +0.0% better, "Starts 2026-11-01…", no Range control, only the Ideal line', async () => {
    await withS1();
    await renderApp({ route: '/goals/g4', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'Marathon prep' });
    await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent('+0.0% better'), SLOW);
    expect(screen.getByTestId('headline-sub')).toHaveTextContent('Starts 2026-11-01. Your line will appear once the goal begins.');
    expect(screen.getByTestId('curve-summary')).toHaveTextContent('Starts 2026-11-01. Your line will appear once the goal begins.');
    expect(screen.queryByRole('radio', { name: en.goal.detail.rangeWhole })).toBeNull();
    expect(screen.getByText(en.goal.status.upcoming)).toBeInTheDocument();
    const chart = await screen.findByTestId('curve-chart', undefined, SLOW);
    expect(chart).toHaveAttribute('data-ideal', '30');
    expect(chart).toHaveAttribute('data-actual', '0');
    expect(screen.getByTestId('stat-pace')).toHaveTextContent(en.stat.paceOnTrack);
  });

  it('ended goal (Old course): badge Ended, actual stops at the end date: Day 181 of 181 · 1 day on target · 1.01^1 = 1.010, default range "So far"', async () => {
    await withS1();
    await renderApp({ route: '/goals/g5', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'Old course' });
    expect(screen.getByText(en.goal.status.ended)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent('+1.0% better'), SLOW);
    expect(norm(screen.getByTestId('headline-sub').textContent)).toBe('Day 181 of 181 · 1 day on target · 1.01^1 = 1.010');
    // 181 days > 120 → "So far" by default (A-D4); for an ended goal both ranges show the whole period.
    await waitFor(() => expect(screen.getByRole('radio', { name: en.goal.detail.rangeSoFar })).toBeChecked());
    expect(screen.getByTestId('curve-chart')).toHaveAttribute('data-ideal', '181');
    expect(screen.getByTestId('curve-summary')).toHaveTextContent('Day 181 of 181: you are +1.0% better. The ideal line is +505.6%. You hit your target on 1 of 181 days.');
  });

  it('Archive → badge Archived, Restore button, toast; Restore → back to Active (M5-AC4)', async () => {
    const user = userEvent.setup();
    await withS1();
    await renderApp({ route: '/goals/g3', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'Spanish' });
    await user.click(screen.getByRole('button', { name: en.goals.archive }));
    await waitFor(() => expect(screen.getByText(en.goal.status.archived)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(en.toast.goalArchived));
    expect((await tc!.container.db.goals.get('g3'))?.archived).toBe(true);
    expect(screen.queryByRole('button', { name: en.goals.archive })).toBeNull();
    // Data is kept: headline and history unchanged.
    await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent('+1.0% better'), SLOW);
    expect(screen.getAllByTestId('history-row')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: en.goals.restore }));
    await waitFor(() => expect(screen.getByText(en.goal.status.active)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(en.toast.goalRestored));
    expect((await tc!.container.db.goals.get('g3'))?.archived).toBe(false);
  });

  it('Archive while its timer runs → GOAL_TIMER_RUNNING alert, goal unchanged', async () => {
    const user = userEvent.setup();
    await withS1();
    await tc!.container.db.kv.put({ key: 'activeTimer', value: { goalId: 'g1', startedAt: '2026-10-09T02:00:00.000Z' } });
    await renderApp({ route: '/goals/g1', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'Read' });
    await user.click(screen.getByRole('button', { name: en.goals.archive }));
    expect(await screen.findByRole('alert')).toHaveTextContent(en.errors.GOAL_TIMER_RUNNING);
    expect((await tc!.container.db.goals.get('g1'))?.archived).toBe(false);
    expect(screen.getByText(en.goal.status.active)).toBeInTheDocument();
  });

  it('entries subscription error → ErrorState with Retry that re-subscribes', async () => {
    const user = userEvent.setup();
    await withS1();
    const real = tc!.container.entryService.watchByGoal.bind(tc!.container.entryService);
    let fail = true;
    tc!.container.entryService.watchByGoal = (goalId: string) => (fail ? { subscribe: (_n, onError) => (onError?.(new Error('boom')), () => {}) } : real(goalId));
    await renderApp({ route: '/goals/g1', container: tc });
    const error = await screen.findByTestId('error-state');
    expect(error).toHaveTextContent(en.errors.loadViewTitle);
    fail = false;
    await user.click(within(error).getByRole('button', { name: en.common.retry }));
    await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent('+8.3% better'), SLOW);
  });

  it('vi: headline "Tốt hơn +8,3%", subtitle with 1,01 and 1,083, summary/legend/range/tooltip strings; no English leaks in every state (M5-AC12)', async () => {
    const user = userEvent.setup();
    await withS1('vi');
    const app = await renderApp({ route: '/goals/g1', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'Read' });
    await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent('Tốt hơn +8,3%'), SLOW);
    expect(norm(screen.getByTestId('headline-sub').textContent)).toBe('Ngày 9/31 · 8 ngày đạt chỉ tiêu · 1,01^8 = 1,083');
    expect(screen.getByTestId('curve-summary')).toHaveTextContent('Ngày 9/31: bạn đã tốt hơn +8,3%. Đường lý tưởng là +9,4%. Bạn đạt chỉ tiêu 8/9 ngày.');
    expect(within(screen.getByTestId('curve-legend')).getAllByRole('listitem').map((li) => li.textContent)).toEqual([vi.goal.detail.legendIdeal, vi.goal.detail.legendYou]);
    expect(screen.getByRole('radio', { name: vi.goal.detail.rangeWhole })).toBeChecked();
    expect(screen.getByRole('radio', { name: vi.goal.detail.rangeSoFar })).toBeInTheDocument();
    expect(screen.getByText(vi.goal.detail.showTable)).toBeInTheDocument();
    expect(screen.getByTestId('stat-progress')).toHaveTextContent('25,8%');
    expect(screen.getByTestId('stat-pace')).toHaveTextContent('Chậm 30 phút');
    const chart = await screen.findByTestId('curve-chart', undefined, SLOW);
    expect(chart).toHaveAccessibleName('Ngày 9/31: bạn đã tốt hơn +8,3%. Đường lý tưởng là +9,4%. Bạn đạt chỉ tiêu 8/9 ngày.');
    await user.click(screen.getByText(vi.goal.detail.showTable));
    const details = screen.getByText(vi.goal.detail.showTable).closest('details')!;
    if (!details.open) {
      details.open = true;
      fireEvent(details, new Event('toggle'));
    }
    await screen.findByTestId('curve-table');
    expect(scanVi()).toEqual([]);
    app.unmount();

    for (const [route, heading] of [
      ['/goals/g6', 'Stretch'],
      ['/goals/g4', 'Marathon prep'],
      ['/goals/g5', 'Old course'],
    ] as const) {
      const view = await renderApp({ route, container: tc });
      await screen.findByRole('heading', { level: 1, name: heading });
      await waitFor(() => expect(screen.getByTestId('headline')).toBeInTheDocument(), SLOW);
      await screen.findByTestId('curve-chart', undefined, SLOW);
      expect(scanVi()).toEqual([]);
      view.unmount();
    }

    // Archived: badge + Restore, then the GOAL_TIMER_RUNNING alert.
    await tc!.container.db.goals.update('g2', { archived: true });
    const archived = await renderApp({ route: '/goals/g2', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'Guitar' });
    expect(screen.getByText(vi.goal.status.archived)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: vi.goals.restore })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('headline')).toBeInTheDocument(), SLOW);
    expect(scanVi()).toEqual([]);
    archived.unmount();
    await tc!.container.db.goals.update('g2', { archived: false });
    await tc!.container.db.kv.put({ key: 'activeTimer', value: { goalId: 'g2', startedAt: '2026-10-09T02:00:00.000Z' } });
    await renderApp({ route: '/goals/g2', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'Guitar' });
    await user.click(screen.getByRole('button', { name: vi.goals.archive }));
    expect(await screen.findByRole('alert')).toHaveTextContent(vi.errors.GOAL_TIMER_RUNNING);
    expect(scanVi()).toEqual([]);
  });

  it('vi: ErrorState of the detail view has no English leaks', async () => {
    await withS1('vi');
    tc!.container.entryService.watchByGoal = () => ({ subscribe: (_n, onError) => (onError?.(new Error('boom')), () => {}) });
    await renderApp({ route: '/goals/g1', container: tc });
    expect(await screen.findByTestId('error-state')).toHaveTextContent(vi.errors.loadViewTitle);
    expect(scanVi()).toEqual([]);
  });
});
