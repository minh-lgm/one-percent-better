// M5-AC2 / M5-AC5 / M5-AC12 (curve copy) superseded by M9-AC4 / M9-AC5 / M9-AC6 (FR-27 v3.0).
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi as vitest } from 'vitest';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import { buildEntry, buildGoal, datasetO1, datasetR1, datasetR3, datasetS1, FIXED_NOW, FIXED_NOW_R1 } from '../../test/builders';
import { createTestContainer, type TestContainer } from '../../test/container';
import { renderApp, scanVi } from '../../test/render-with-locale';

// The lazy Recharts curve is replaced by a stub (F-D1): this file tests the Goal detail
// screen (headline, subtitle, summary, range, table, stats, archive); CurveChart.test.tsx tests the chart.
vitest.mock('../components/CurveChart', () => import('../../test/stubs/CurveChart'));

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

const MINUS = '−';

async function withS1(locale: 'en' | 'vi' = 'en') {
  tc = await createTestContainer({ locale });
  const { goals, entries } = datasetS1();
  await tc.container.db.goals.bulkPut([...goals, buildGoal({ id: 'g6', name: 'Stretch', why: '', targetMinutes: 5, startDate: '2026-10-01', endDate: '2026-10-31', createdAt: '2026-09-30T06:00:00.000Z', updatedAt: '2026-09-30T06:00:00.000Z' })]);
  await tc.container.db.entries.bulkPut(entries);
  return tc;
}

/** R1 (the user's real data) with the clock at 2026-10-13 10:00 (+07:00), or `now` when given. */
async function withR1(locale: 'en' | 'vi' = 'en', now: Date = FIXED_NOW_R1, data = datasetR1()) {
  vitest.setSystemTime(now);
  tc = await createTestContainer({ locale });
  await tc.container.db.goals.bulkPut(data.goals);
  await tc.container.db.entries.bulkPut(data.entries);
  return tc;
}

// Lazy route + live queries: allow more than the default when the suite runs in parallel.
const SLOW = { timeout: 8000 };
const norm = (s: string | null) => (s ?? '').replace(/[\u00A0\u202F]/g, ' ');

async function openTable(user: ReturnType<typeof userEvent.setup>, copy: typeof en | typeof vi) {
  const details = screen.getByText(copy.goal.detail.showTable).closest('details')!;
  await user.click(screen.getByText(copy.goal.detail.showTable));
  if (!details.open) {
    details.open = true;
    fireEvent(details, new Event('toggle'));
  }
  return screen.findByTestId('curve-table');
}

const cellsOf = (row: HTMLElement) => within(row).getAllByRole('cell').map((c) => norm(c.textContent));

describe('Goal detail — curve v3 with R1, the user\'s real data (M9-AC4, M9-AC6)', () => {
  it('R1 at 2026-10-13: +440.0% better, Day 4 of 83, "Today: 27 min, +92.9% vs Oct 12 (14 min). ×5.4 since Oct 10 (5 min).", summary, 3 legend items, Whole period, Progress 2.2 %, streak 0', async () => {
    await withR1();
    await renderApp({ route: '/goals/r1', container: tc });
    expect(await screen.findByRole('heading', { level: 1, name: 'Đọc sách' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent('+440.0% better'), SLOW);
    expect(screen.getByTestId('headline')).toHaveAttribute('data-sign', 'positive');
    expect(screen.getByTestId('headline')).not.toHaveClass('hl-down');
    expect(screen.getByTestId('headline-day')).toHaveTextContent('Day 4 of 83');
    expect(norm(screen.getByTestId('headline-sub').textContent)).toBe('Today: 27 min, +92.9% vs Oct 12 (14 min). ×5.4 since Oct 10 (5 min).');
    expect(screen.getByTestId('headline-sub')).toHaveAttribute('data-variant', 'today');
    expect(screen.getByTestId('curve-summary')).toHaveTextContent('Day 4 of 83: your line is +440.0% compared with your first logged day. The ideal line is +3.0%.');
    expect(screen.getByTestId('curve-note')).toHaveTextContent(en.goal.detail.chartNote);
    expect(within(screen.getByTestId('curve-legend')).getAllByRole('listitem').map((li) => li.textContent)).toEqual([en.goal.detail.legendIdeal, en.goal.detail.legendYou, en.goal.detail.legendZero]);
    expect(screen.getByRole('radio', { name: en.goal.detail.rangeWhole })).toBeChecked();
    const chart = await screen.findByTestId('curve-chart', undefined, SLOW);
    expect(chart).toHaveAccessibleName('Day 4 of 83: your line is +440.0% compared with your first logged day. The ideal line is +3.0%.');
    expect(chart).toHaveAttribute('data-ideal', '83');
    expect(chart).toHaveAttribute('data-actual', '4');
    // Stat cards keep the M4 rules: the 30-minute target is never met (A-42).
    expect(screen.getByTestId('stat-progress')).toHaveTextContent('2.2%');
    expect(screen.getByTestId('stat-progress')).toHaveTextContent('56 of 2,490 min');
    expect(screen.getByTestId('stat-current')).toHaveTextContent('0 days');
    expect(screen.getByTestId('stat-longest')).toHaveTextContent('0 days');
    expect(screen.getAllByTestId('history-row')).toHaveLength(4);
  });

  it('R1 table: 5 columns; 83 rows (Whole period), 2026-10-13 = +3.0% / +440.0% / 27 / +92.9%, 10-12 = +2.0% / +180.0% / 14 / +40.0%, future rows "—"; So far → 4 rows', async () => {
    const user = userEvent.setup();
    await withR1();
    await renderApp({ route: '/goals/r1', container: tc });
    await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent('+440.0% better'), SLOW);
    expect(screen.queryByTestId('curve-table')).toBeNull();
    const table = await openTable(user, en);
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([en.goal.detail.tableDate, en.goal.detail.tableIdeal, en.goal.detail.tableYou, en.goal.detail.tableMinutes, en.goal.detail.tableChange]);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(83);
    expect(within(rows[0]).getByRole('rowheader')).toHaveTextContent('2026-10-10');
    expect(cellsOf(rows[0])).toEqual(['+0.0%', '+0.0%', '5', '—']);
    expect(cellsOf(rows[1])).toEqual(['+1.0%', '+100.0%', '10', '+100.0%']);
    expect(cellsOf(rows[2])).toEqual(['+2.0%', '+180.0%', '14', '+40.0%']);
    expect(within(rows[3]).getByRole('rowheader')).toHaveTextContent('2026-10-13');
    expect(cellsOf(rows[3])).toEqual(['+3.0%', '+440.0%', '27', '+92.9%']);
    expect(cellsOf(rows[4])).toEqual(['+4.1%', '—', '—', '—']);
    expect(cellsOf(rows[82])[0]).toBe('+126.1%');

    await user.click(screen.getByRole('radio', { name: en.goal.detail.rangeSoFar }));
    await waitFor(() => expect(within(screen.getByTestId('curve-table')).getAllByRole('row').slice(1)).toHaveLength(4));
    await waitFor(() => expect(screen.getByTestId('curve-chart')).toHaveAttribute('data-ideal', '4'));
    expect(screen.getByTestId('curve-chart')).toHaveAttribute('data-actual', '4');
  });

  it('R1 on 2026-10-14 without a new entry: still +440.0%, "Last logged Oct 13: …"; then 3 minutes today → "−40.0% vs your first day" in plain text colour (A-39)', async () => {
    await withR1('en', new Date('2026-10-14T10:00:00+07:00'));
    await renderApp({ route: '/goals/r1', container: tc });
    await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent('+440.0% better'), SLOW);
    expect(screen.getByTestId('headline-day')).toHaveTextContent('Day 5 of 83');
    expect(norm(screen.getByTestId('headline-sub').textContent)).toBe('Last logged Oct 13: 27 min, +92.9% vs Oct 12 (14 min). ×5.4 since Oct 10 (5 min).');
    expect(screen.getByTestId('headline-sub')).toHaveAttribute('data-variant', 'earlier');
    expect(screen.getByTestId('curve-summary')).toHaveTextContent('Day 5 of 83: your line is +440.0% compared with your first logged day. The ideal line is +4.1%.');

    await tc!.container.entryService.add({ goalId: 'r1', date: '2026-10-14', minutes: 3, note: '', source: 'manual' }, new Date('2026-10-14T10:00:00+07:00'));
    await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent(`${MINUS}40.0% vs your first day`), SLOW);
    expect(screen.getByTestId('headline')).toHaveAttribute('data-sign', 'negative');
    expect(screen.getByTestId('headline')).toHaveClass('hl-down');
    expect(norm(screen.getByTestId('headline-sub').textContent)).toBe(`Today: 3 min, ${MINUS}88.9% vs Oct 13 (27 min). ×0.6 since Oct 10 (5 min).`);
    expect(screen.getByTestId('curve-summary')).toHaveTextContent(`Day 5 of 83: your line is ${MINUS}40.0% compared with your first logged day. The ideal line is +4.1%.`);
  });

  it('one logged day only (R1 keeping 10-10): +0.0% better and "Starting point: 5 min on Oct 10. …" without ×', async () => {
    const r1 = datasetR1();
    await withR1('en', FIXED_NOW_R1, { goals: r1.goals, entries: r1.entries.slice(0, 1) });
    await renderApp({ route: '/goals/r1', container: tc });
    await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent('+0.0% better'), SLOW);
    expect(screen.getByTestId('headline-day')).toHaveTextContent('Day 4 of 83');
    expect(norm(screen.getByTestId('headline-sub').textContent)).toBe('Starting point: 5 min on Oct 10. Your line moves once you log on another day.');
    expect(screen.getByTestId('headline-sub')).toHaveAttribute('data-variant', 'start');
    expect(screen.getByTestId('headline-sub').textContent).not.toContain('×');
    expect(screen.getByTestId('curve-summary')).toHaveTextContent('Day 4 of 83: your line is +0.0% compared with your first logged day. The ideal line is +3.0%.');
  });

  it('R3 (5 → 3 minutes, 2026-10-11): headline "−40.0% vs your first day", subtitle ×0.6', async () => {
    await withR1('en', new Date('2026-10-11T10:00:00+07:00'), datasetR3());
    await renderApp({ route: '/goals/r1', container: tc });
    await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent(`${MINUS}40.0% vs your first day`), SLOW);
    expect(screen.getByTestId('headline')).toHaveClass('hl-down');
    expect(norm(screen.getByTestId('headline-sub').textContent)).toBe(`Today: 3 min, ${MINUS}40.0% vs Oct 10 (5 min). ×0.6 since Oct 10 (5 min).`);
  });
});

describe('Goal detail — S1 at 2026-10-09, special states, archive (M9-AC4, M9-AC6, M5-AC2 rest, M5-AC4)', () => {
  it('Read (S1): +0.0% better, Day 9 of 31, "Last logged Oct 8: 30 min, +0.0% vs Oct 7 (30 min). ×1 since Oct 1 (30 min).", stats 25.8 % / 8 days, 8 history rows', async () => {
    await withS1();
    await renderApp({ route: '/goals/g1', container: tc });
    expect(await screen.findByRole('heading', { level: 1, name: 'Read' })).toBeInTheDocument();
    expect(screen.getByText('Be smarter')).toBeInTheDocument();
    expect(screen.getByText('30 min/day · 2026-10-01 – 2026-10-31')).toBeInTheDocument();
    expect(screen.getByText(en.goal.status.active)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent('+0.0% better'), SLOW);
    expect(screen.getByText(en.goal.detail.eyebrow)).toBeInTheDocument();
    expect(screen.getByTestId('headline-day')).toHaveTextContent('Day 9 of 31');
    expect(norm(screen.getByTestId('headline-sub').textContent)).toBe('Last logged Oct 8: 30 min, +0.0% vs Oct 7 (30 min). ×1 since Oct 1 (30 min).');
    expect(screen.getByRole('heading', { level: 2, name: en.goal.detail.chartTitle })).toBeInTheDocument();
    expect(screen.getByTestId('curve-summary')).toHaveTextContent('Day 9 of 31: your line is +0.0% compared with your first logged day. The ideal line is +8.3%.');
    expect(screen.getByRole('radio', { name: en.goal.detail.rangeWhole })).toBeChecked();
    const chart = await screen.findByTestId('curve-chart', undefined, SLOW);
    expect(chart).toHaveAttribute('data-stub', 'curve-chart');
    expect(chart).toHaveAttribute('data-ideal', '31');
    expect(chart).toHaveAttribute('data-actual', '9');
    expect(screen.getByRole('figure', { name: en.goal.detail.chartCaption })).toBeInTheDocument();
    // Stats (M4 rules, unchanged by v3): progress 25.8 %, 30 min behind, streak 8/8.
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

  it('S1 table: Read rows (first day "—" change, unlogged today 0 / "—", future "—"); Guitar defaults to "So far" and shows −50.0% on 2026-09-15', async () => {
    const user = userEvent.setup();
    await withS1();
    const app = await renderApp({ route: '/goals/g1', container: tc });
    await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent('+0.0% better'), SLOW);
    let table = await openTable(user, en);
    let rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(31);
    expect(cellsOf(rows[0])).toEqual(['+0.0%', '+0.0%', '30', '—']);
    expect(cellsOf(rows[7])).toEqual(['+7.2%', '+0.0%', '30', '+0.0%']);
    expect(cellsOf(rows[8])).toEqual(['+8.3%', '+0.0%', '0', '—']);
    expect(cellsOf(rows[9])).toEqual(['+9.4%', '—', '—', '—']);
    expect(cellsOf(rows[30])[0]).toBe('+34.8%');
    await user.click(screen.getByRole('radio', { name: en.goal.detail.rangeSoFar }));
    await waitFor(() => expect(within(screen.getByTestId('curve-table')).getAllByRole('row').slice(1)).toHaveLength(9));
    app.unmount();

    await renderApp({ route: '/goals/g2', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'Guitar' });
    await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent('+0.0% better'), SLOW);
    expect(norm(screen.getByTestId('headline-sub').textContent)).toBe('Last logged Oct 8: 20 min, +0.0% vs Oct 7 (20 min). ×1 since Sep 1 (20 min).');
    await waitFor(() => expect(screen.getByRole('radio', { name: en.goal.detail.rangeSoFar })).toBeChecked());
    table = await openTable(user, en);
    rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(39);
    expect(within(rows[14]).getByRole('rowheader')).toHaveTextContent('2026-09-15');
    expect(cellsOf(rows[14])).toEqual(['+14.9%', `${MINUS}50.0%`, '10', `${MINUS}50.0%`]);
    expect(cellsOf(rows[20])).toEqual(['+22.0%', `${MINUS}50.0%`, '0', '—']);
    expect(cellsOf(rows[36])).toEqual(['+43.1%', '+0.0%', '20', '+100.0%']);
  });

  it('a goal without entries: +0.0% better, Day 9 of 31, empty.detail.curve as the subtitle, "nothing logged yet" summary, "—" in the You columns, empty history', async () => {
    const user = userEvent.setup();
    await withS1();
    await renderApp({ route: '/goals/g6', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'Stretch' });
    await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent('+0.0% better'), SLOW);
    expect(screen.getByTestId('headline-day')).toHaveTextContent('Day 9 of 31');
    expect(screen.getByTestId('headline-sub')).toHaveTextContent(en.empty.detail.curve);
    expect(screen.getByTestId('headline-sub')).toHaveAttribute('data-variant', 'empty');
    expect(screen.getByTestId('curve-summary')).toHaveTextContent('Day 9 of 31: nothing logged yet. The ideal line is +8.3%.');
    expect(screen.getByRole('heading', { level: 3, name: en.empty.detail.history })).toBeInTheDocument();
    expect(screen.getByTestId('stat-current')).toHaveTextContent('0 days');
    const table = await openTable(user, en);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(cellsOf(rows[0])).toEqual(['+0.0%', '—', '—', '—']);
    expect(cellsOf(rows[8])).toEqual(['+8.3%', '—', '—', '—']);
  });

  it('upcoming goal: +0.0% better, "Starts 2026-11-01…" without a Day line, no Range control, only the Ideal line', async () => {
    await withS1();
    await renderApp({ route: '/goals/g4', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'Marathon prep' });
    await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent('+0.0% better'), SLOW);
    expect(screen.getByTestId('headline-sub')).toHaveTextContent('Starts 2026-11-01. Your line will appear once the goal begins.');
    expect(screen.getByTestId('headline-sub')).toHaveAttribute('data-variant', 'upcoming');
    expect(screen.queryByTestId('headline-day')).toBeNull();
    expect(screen.getByTestId('curve-summary')).toHaveTextContent('Starts 2026-11-01. Your line will appear once the goal begins.');
    expect(screen.queryByRole('radio', { name: en.goal.detail.rangeWhole })).toBeNull();
    expect(screen.getByText(en.goal.status.upcoming)).toBeInTheDocument();
    const chart = await screen.findByTestId('curve-chart', undefined, SLOW);
    expect(chart).toHaveAttribute('data-ideal', '30');
    expect(chart).toHaveAttribute('data-actual', '0');
    expect(screen.getByTestId('stat-pace')).toHaveTextContent(en.stat.paceOnTrack);
  });

  it('ended goal (Old course, one entry on the last day): badge Ended, +0.0% better, Day 181 of 181, "Starting point: 15 min on Jun 30…", default range "So far"', async () => {
    await withS1();
    await renderApp({ route: '/goals/g5', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'Old course' });
    expect(screen.getByText(en.goal.status.ended)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent('+0.0% better'), SLOW);
    expect(screen.getByTestId('headline-day')).toHaveTextContent('Day 181 of 181');
    expect(norm(screen.getByTestId('headline-sub').textContent)).toBe('Starting point: 15 min on Jun 30. Your line moves once you log on another day.');
    // 181 days > 120 → "So far" by default (A-D4); for an ended goal both ranges show the whole period.
    await waitFor(() => expect(screen.getByRole('radio', { name: en.goal.detail.rangeSoFar })).toBeChecked());
    expect(screen.getByTestId('curve-chart')).toHaveAttribute('data-ideal', '181');
    expect(screen.getByTestId('curve-chart')).toHaveAttribute('data-actual', '181');
    expect(screen.getByTestId('curve-summary')).toHaveTextContent('Day 181 of 181: your line is +0.0% compared with your first logged day. The ideal line is +499.6%.');
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
    await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent('+0.0% better'), SLOW);
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
    await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent('+0.0% better'), SLOW);
  });
});

describe('Goal detail — Vietnamese (M9-AC5)', () => {
  it('vi R1: "Tốt hơn +440,0%", subtitle with ×5,4 / +92,9% / 27 phút / 14 phút / 5 phút, summary, legend, note, table +440,0% / +3,0% / +40,0%; no English leaks', async () => {
    const user = userEvent.setup();
    await withR1('vi');
    await renderApp({ route: '/goals/r1', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'Đọc sách' });
    await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent('Tốt hơn +440,0%'), SLOW);
    expect(screen.getByTestId('headline-day')).toHaveTextContent('Ngày 4/83');
    const sub = norm(screen.getByTestId('headline-sub').textContent);
    const d = (day: number) => new Intl.DateTimeFormat('vi-VN', { month: 'short', day: 'numeric' }).format(new Date(2026, 9, day));
    expect(sub).toBe(`Hôm nay: 27 phút, +92,9% so với ${d(12)} (14 phút). ×5,4 kể từ ${d(10)} (5 phút).`);
    for (const part of ['×5,4', '+92,9%', '27 phút', '14 phút', '5 phút']) expect(sub).toContain(part);
    expect(screen.getByTestId('curve-summary')).toHaveTextContent('Ngày 4/83: đường của bạn ở mức +440,0% so với ngày có ghi đầu tiên. Đường lý tưởng ở mức +3,0%.');
    expect(screen.getByTestId('curve-note')).toHaveTextContent(vi.goal.detail.chartNote);
    expect(within(screen.getByTestId('curve-legend')).getAllByRole('listitem').map((li) => li.textContent)).toEqual([vi.goal.detail.legendIdeal, vi.goal.detail.legendYou, vi.goal.detail.legendZero]);
    expect(screen.getByRole('radio', { name: vi.goal.detail.rangeWhole })).toBeChecked();
    expect(screen.getByRole('figure', { name: vi.goal.detail.chartCaption })).toBeInTheDocument();
    const chart = await screen.findByTestId('curve-chart', undefined, SLOW);
    expect(chart).toHaveAccessibleName('Ngày 4/83: đường của bạn ở mức +440,0% so với ngày có ghi đầu tiên. Đường lý tưởng ở mức +3,0%.');
    expect(screen.getByTestId('stat-progress')).toHaveTextContent('2,2%');
    const table = await openTable(user, vi);
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([vi.goal.detail.tableDate, vi.goal.detail.tableIdeal, vi.goal.detail.tableYou, vi.goal.detail.tableMinutes, vi.goal.detail.tableChange]);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(within(rows[3]).getByRole('rowheader')).toHaveTextContent('13/10/2026');
    expect(cellsOf(rows[3])).toEqual(['+3,0%', '+440,0%', '27', '+92,9%']);
    expect(cellsOf(rows[2])).toEqual(['+2,0%', '+180,0%', '14', '+40,0%']);
    expect(scanVi()).toEqual([]);
  });

  it('vi: R3 headline "−40,0% so với ngày đầu"; one logged day, no entries (empty.detail.curve), upcoming, ended, archived and ErrorState have no English leaks', async () => {
    const user = userEvent.setup();
    await withR1('vi', new Date('2026-10-11T10:00:00+07:00'), datasetR3());
    const down = await renderApp({ route: '/goals/r1', container: tc });
    await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent(`${MINUS}40,0% so với ngày đầu`), SLOW);
    expect(screen.getByTestId('headline')).toHaveClass('hl-down');
    expect(norm(screen.getByTestId('headline-sub').textContent)).toContain('×0,6');
    expect(norm(screen.getByTestId('headline-sub').textContent)).toContain(`${MINUS}40,0%`);
    await screen.findByTestId('curve-chart', undefined, SLOW);
    expect(scanVi()).toEqual([]);
    down.unmount();
    const r1 = datasetR1();
    await tc!.container.db.entries.clear();
    await tc!.container.db.entries.bulkPut(r1.entries.slice(0, 1));
    vitest.setSystemTime(FIXED_NOW_R1);
    const start = await renderApp({ route: '/goals/r1', container: tc });
    await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent('Tốt hơn +0,0%'), SLOW);
    expect(norm(screen.getByTestId('headline-sub').textContent)).toMatch(/^Điểm xuất phát: 5 phút vào .+\. Đường của bạn sẽ di chuyển khi bạn ghi thêm vào một ngày khác\.$/);
    expect(scanVi()).toEqual([]);
    start.unmount();
    await tc!.dispose();

    vitest.setSystemTime(FIXED_NOW);
    await withS1('vi');
    for (const [route, heading, sub] of [
      ['/goals/g6', 'Stretch', vi.empty.detail.curve],
      ['/goals/g4', 'Marathon prep', 'Bắt đầu 01/11/2026. Đường của bạn sẽ xuất hiện khi mục tiêu bắt đầu.'],
      ['/goals/g5', 'Old course', null],
      ['/goals/g1', 'Read', null],
    ] as const) {
      const view = await renderApp({ route, container: tc });
      await screen.findByRole('heading', { level: 1, name: heading });
      await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent('Tốt hơn +0,0%'), SLOW);
      if (sub) expect(screen.getByTestId('headline-sub')).toHaveTextContent(sub);
      await screen.findByTestId('curve-chart', undefined, SLOW);
      if (route === '/goals/g6') expect(screen.getByTestId('curve-summary')).toHaveTextContent('Ngày 9/31: chưa ghi gì. Đường lý tưởng ở mức +8,3%.');
      if (route === '/goals/g1') {
        expect(norm(screen.getByTestId('headline-sub').textContent)).toMatch(/^Lần ghi gần nhất .+: 30 phút, \+0,0% so với .+ \(30 phút\)\. ×1 kể từ .+ \(30 phút\)\.$/);
        await openTable(user, vi);
      }
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

// ---- v4.0 (M11-AC10, M11-AC11; DESIGN S4 "Goal không thời hạn", 7.6.4): dataset O1 ----
describe('Goal detail — open-ended goal O1 (M11-AC10, FR-27 v4.0, FR-56)', () => {
  async function withO1(locale: 'en' | 'vi' = 'en', now: Date = FIXED_NOW, goalPatch: Partial<ReturnType<typeof buildGoal>> = {}, entries = datasetO1().entries) {
    vitest.setSystemTime(now);
    tc = await createTestContainer({ locale });
    await tc.container.db.goals.bulkPut([{ ...datasetO1().goals[0], ...goalPatch }]);
    await tc.container.db.entries.bulkPut(entries);
    return tc;
  }

  it('at 2026-10-09: info "from 2026-10-01, no end date", +100.0% better, "Day 9" (no total), "Last logged Oct 8 …", open summary, NO Range, 9 + 9 points, 9 table rows ending today, stats 61.1 % / 35 min behind / 1 / 2', async () => {
    const user = userEvent.setup();
    await withO1();
    await renderApp({ route: '/goals/o1', container: tc });
    expect(await screen.findByRole('heading', { level: 1, name: 'Meditate' })).toBeInTheDocument();
    expect(screen.getByText('10 min/day · from 2026-10-01, no end date')).toBeInTheDocument();
    expect(screen.getByText(en.goal.status.active)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent('+100.0% better'), SLOW);
    expect(screen.getByTestId('headline')).toHaveAttribute('data-sign', 'positive');
    expect(screen.getByTestId('headline-day')).toHaveTextContent(/^Day 9$/);
    expect(screen.getByTestId('headline-day').textContent).not.toContain('of');
    expect(norm(screen.getByTestId('headline-sub').textContent)).toBe('Last logged Oct 8: 20 min, +100.0% vs Oct 5 (10 min). ×2 since Oct 1 (10 min).');
    expect(screen.getByTestId('headline-sub')).toHaveAttribute('data-variant', 'earlier');
    expect(screen.getByRole('heading', { level: 2, name: en.goal.detail.chartTitle })).toBeInTheDocument();
    expect(screen.getByTestId('curve-summary')).toHaveTextContent('Day 9: your line is +100.0% compared with your first logged day. The ideal line is +8.3%.');
    expect(screen.queryByRole('radio', { name: en.goal.detail.rangeWhole })).toBeNull();
    expect(screen.queryByRole('radio', { name: en.goal.detail.rangeSoFar })).toBeNull();
    expect(screen.queryByRole('group', { name: en.goal.detail.rangeLegend })).toBeNull();
    const chart = await screen.findByTestId('curve-chart', undefined, SLOW);
    expect(chart).toHaveAccessibleName('Day 9: your line is +100.0% compared with your first logged day. The ideal line is +8.3%.');
    expect(chart).toHaveAttribute('data-ideal', '9');
    expect(chart).toHaveAttribute('data-actual', '9');
    const table = await openTable(user, en);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(9);
    expect(within(rows[0]).getByRole('rowheader')).toHaveTextContent('2026-10-01');
    expect(within(rows[8]).getByRole('rowheader')).toHaveTextContent('2026-10-09');
    expect(cellsOf(rows[0])).toEqual(['+0.0%', '+0.0%', '10', '—']);
    expect(cellsOf(rows[1])).toEqual(['+1.0%', '+50.0%', '15', '+50.0%']);
    expect(cellsOf(rows[4])).toEqual(['+4.1%', '+0.0%', '10', `${MINUS}33.3%`]);
    expect(cellsOf(rows[7])).toEqual(['+7.2%', '+100.0%', '20', '+100.0%']);
    expect(cellsOf(rows[8])).toEqual(['+8.3%', '+100.0%', '0', '—']);
    expect(screen.getByTestId('stat-progress')).toHaveTextContent('61.1%');
    expect(screen.getByTestId('stat-progress')).toHaveTextContent('55 of 90 min expected so far');
    expect(within(screen.getByTestId('stat-progress')).getByRole('progressbar', { name: en.stat.progress })).toHaveAttribute('aria-valuenow', '61.1');
    expect(screen.getByTestId('stat-pace')).toHaveTextContent('35 min behind');
    expect(screen.getByTestId('stat-pace')).toHaveTextContent('Expected 90 min by today');
    expect(screen.getByTestId('stat-current')).toHaveTextContent('1 day');
    expect(screen.getByTestId('stat-longest')).toHaveTextContent('2 days');
    expect(screen.getAllByTestId('history-row')).toHaveLength(4);
  });

  it('not started yet (start 2026-11-01): badge Upcoming, +0.0% better, "Starts …" line, NO chart card at all, Progress 0.0% "0 of 0 min expected so far", On pace', async () => {
    await withO1('en', FIXED_NOW, { startDate: '2026-11-01' }, []);
    await renderApp({ route: '/goals/o1', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'Meditate' });
    expect(screen.getByText(en.goal.status.upcoming)).toBeInTheDocument();
    expect(screen.getByText('10 min/day · from 2026-11-01, no end date')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent('+0.0% better'), SLOW);
    expect(screen.getByTestId('headline-sub')).toHaveTextContent('Starts 2026-11-01. Your line will appear once the goal begins.');
    expect(screen.getByTestId('headline-sub')).toHaveAttribute('data-variant', 'upcoming');
    expect(screen.queryByTestId('headline-day')).toBeNull();
    expect(screen.queryByRole('heading', { level: 2, name: en.goal.detail.chartTitle })).toBeNull();
    expect(screen.queryByTestId('curve-chart')).toBeNull();
    expect(screen.queryByTestId('curve-summary')).toBeNull();
    expect(screen.queryByTestId('curve-legend')).toBeNull();
    expect(screen.queryByText(en.goal.detail.showTable)).toBeNull();
    expect(screen.queryByRole('radio', { name: en.goal.detail.rangeWhole })).toBeNull();
    expect(screen.getByTestId('stat-progress')).toHaveTextContent('0.0%');
    expect(screen.getByTestId('stat-progress')).toHaveTextContent('0 of 0 min expected so far');
    expect(screen.getByTestId('stat-pace')).toHaveTextContent(en.stat.paceOnTrack);
    expect(screen.getByTestId('stat-pace')).toHaveTextContent('Expected 0 min by today');
    expect(screen.getByTestId('stat-current')).toHaveTextContent('0 days');
    expect(screen.getByRole('heading', { level: 2, name: en.goal.detail.historyTitle })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: en.empty.detail.history })).toBeInTheDocument();
  });

  it('first day (start = today, 10 min logged): "Day 1", one point per line, summary "Day 1: … +0.0% … +1.0%"', async () => {
    await withO1('en', FIXED_NOW, { startDate: '2026-10-09' }, [buildEntry({ id: 'x', goalId: 'o1', date: '2026-10-09', minutes: 10 })]);
    await renderApp({ route: '/goals/o1', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'Meditate' });
    await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent('+0.0% better'), SLOW);
    expect(screen.getByTestId('headline-day')).toHaveTextContent(/^Day 1$/);
    expect(screen.getByTestId('headline-sub')).toHaveAttribute('data-variant', 'start');
    expect(screen.getByTestId('curve-summary')).toHaveTextContent('Day 1: your line is +0.0% compared with your first logged day. The ideal line is +0.0%.');
    const chart = await screen.findByTestId('curve-chart', undefined, SLOW);
    expect(chart).toHaveAttribute('data-ideal', '1');
    expect(chart).toHaveAttribute('data-actual', '1');
    expect(screen.getByTestId('stat-progress')).toHaveTextContent('100.0%');
    expect(screen.getByTestId('stat-progress')).toHaveTextContent('10 of 10 min expected so far');
  });

  it('five years later (2031-10-02): still Active, "Day 1,828", 1,828 points, summary without a total; log 10 min → the Progress denominator grows by the day', async () => {
    await withO1('en', new Date('2031-10-02T10:00:00+07:00'));
    await renderApp({ route: '/goals/o1', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'Meditate' });
    expect(screen.getByText(en.goal.status.active)).toBeInTheDocument();
    expect(screen.queryByText(en.goal.status.ended)).toBeNull();
    await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent('+100.0% better'), SLOW);
    expect(screen.getByTestId('headline-day')).toHaveTextContent(/^Day 1,828$/);
    expect(screen.getByTestId('curve-summary').textContent).toMatch(/^Day 1,828: your line is \+100\.0% compared with your first logged day\. The ideal line is \+[\d,]+(\.\d)?%\.$/);
    const chart = await screen.findByTestId('curve-chart', undefined, SLOW);
    expect(chart).toHaveAttribute('data-ideal', '1828');
    expect(chart).toHaveAttribute('data-actual', '1828');
    expect(screen.getByTestId('stat-progress')).toHaveTextContent('55 of 18,280 min expected so far');
    expect(screen.queryByRole('radio', { name: en.goal.detail.rangeSoFar })).toBeNull();
  });

  it('vi: "Tốt hơn +100,0%", "Ngày 9", summary and Progress "55/90 phút dự kiến đến nay", "Chậm 35 phút", info row, no Range, no English leaks (also upcoming)', async () => {
    await withO1('vi');
    const app = await renderApp({ route: '/goals/o1', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'Meditate' });
    await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent('Tốt hơn +100,0%'), SLOW);
    expect(screen.getByText('10 phút/ngày · từ 01/10/2026, không có thời hạn')).toBeInTheDocument();
    expect(screen.getByTestId('headline-day')).toHaveTextContent(/^Ngày 9$/);
    expect(screen.getByTestId('curve-summary')).toHaveTextContent('Ngày 9: đường của bạn ở mức +100,0% so với ngày có ghi đầu tiên. Đường lý tưởng ở mức +8,3%.');
    expect(screen.queryByRole('radio', { name: vi.goal.detail.rangeWhole })).toBeNull();
    expect(screen.getByTestId('stat-progress')).toHaveTextContent('61,1%');
    expect(screen.getByTestId('stat-progress')).toHaveTextContent('55/90 phút dự kiến đến nay');
    expect(screen.getByTestId('stat-pace')).toHaveTextContent('Chậm 35 phút');
    await screen.findByTestId('curve-chart', undefined, SLOW);
    expect(scanVi()).toEqual([]);
    app.unmount();
    await tc!.dispose();
    await withO1('vi', FIXED_NOW, { startDate: '2026-11-01' }, []);
    await renderApp({ route: '/goals/o1', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'Meditate' });
    await waitFor(() => expect(screen.getByTestId('headline')).toHaveTextContent('Tốt hơn +0,0%'), SLOW);
    expect(screen.queryByTestId('curve-chart')).toBeNull();
    expect(screen.getByTestId('stat-progress')).toHaveTextContent('0/0 phút dự kiến đến nay');
    expect(scanVi()).toEqual([]);
  });
});
