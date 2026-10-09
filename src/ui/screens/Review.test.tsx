import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import { buildGoal, datasetS1 } from '../../test/builders';
import { createTestContainer, type TestContainer } from '../../test/container';
import { renderApp, scanVi } from '../../test/render-with-locale';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

async function withS1(locale: 'en' | 'vi' = 'en') {
  tc = await createTestContainer({ locale });
  const { goals, entries } = datasetS1();
  await tc.container.db.goals.bulkPut(goals);
  await tc.container.db.entries.bulkPut(entries);
  return tc;
}

const stat = (id: string) => screen.getByTestId(id);
const norm = (s: string) => s.replace(/[\u00A0\u202F]/g, ' ');
const cell = (date: string) => document.querySelector<HTMLElement>(`[data-date="${date}"]`)!;

// The charts arrive through a lazy chunk + Recharts render: allow more than the default 1 s when the suite runs in parallel.
const SLOW = { timeout: 8000 };
async function chartsReady() {
  await waitFor(() => expect(screen.getByTestId('chart-weekly')).toBeInTheDocument(), SLOW);
  await waitFor(() => expect(screen.getByTestId('chart-monthly')).toBeInTheDocument(), SLOW);
}

describe('Review (M4-AC5, AC6, AC7, AC8)', () => {
  it('All goals, 2026: 4 stat cards, streak 8/10, heatmap summary, two 12-column charts with hidden tables', async () => {
    await withS1();
    await renderApp({ route: '/review', container: tc });
    expect(await screen.findByRole('heading', { level: 1, name: en.review.title })).toBeInTheDocument();
    expect(document.title).toBe('Review — 1% Better');
    expect(await screen.findByRole('combobox', { name: en.review.goalLabel })).toHaveValue('all');
    expect(screen.getByRole('combobox', { name: en.review.yearLabel })).toHaveValue('2026');
    expect(within(screen.getByRole('combobox', { name: en.review.goalLabel })).getAllByRole('option').map((o) => o.textContent)).toEqual([en.review.goalAll, 'Read', 'Guitar', 'Spanish', 'Marathon prep', 'Old course']);

    await waitFor(() => expect(stat('stat-time')).toHaveTextContent('9.4 h'), SLOW);
    expect(stat('stat-time')).toHaveTextContent('In 2026');
    expect(stat('stat-days')).toHaveTextContent('20');
    expect(stat('stat-days')).toHaveTextContent(en.stat.anyGoal);
    expect(stat('stat-current')).toHaveTextContent('8 days');
    expect(stat('stat-longest')).toHaveTextContent('10 days');
    expect(screen.queryByTestId('stat-progress')).toBeNull();
    expect(screen.queryByTestId('stat-pace')).toBeNull();
    expect(screen.getByTestId('stats-note')).toHaveTextContent(en.review.pickGoal);
    expect(screen.getByRole('heading', { level: 2, name: 'Activity in 2026' })).toBeInTheDocument();
    expect(screen.getByTestId('heatmap-summary')).toHaveTextContent('In 2026 you logged time on 21 days and hit your target on 20 days. Longest streak: 10 days.');
    expect(screen.getByRole('grid', { name: 'Activity heatmap for 2026, All goals' })).toBeInTheDocument();

    await chartsReady();
    const weekly = screen.getByRole('table', { name: en.review.weeklyTitle });
    expect(within(weekly).getAllByRole('row')).toHaveLength(13); // header + 12
    expect(within(weekly).getByRole('columnheader', { name: en.chart.bar.colWeek })).toBeInTheDocument();
    expect(within(weekly).getByRole('rowheader', { name: 'Oct 5 – Oct 11' })).toBeInTheDocument();
    expect(within(weekly).getAllByRole('cell').at(-1)).toHaveTextContent('2 h 40 min');
    expect(screen.getByText('Last 12 weeks: 8 h 10 min logged, busiest week starting Oct 5 with 2 h 40 min.')).toBeInTheDocument();
    const monthly = screen.getByRole('table', { name: 'Months of 2026' });
    expect(within(monthly).getAllByRole('row')).toHaveLength(13);
    expect(within(monthly).getAllByRole('rowheader').map((h) => h.textContent)).toEqual(['January 2026', 'February 2026', 'March 2026', 'April 2026', 'May 2026', 'June 2026', 'July 2026', 'August 2026', 'September 2026', 'October 2026', 'November 2026', 'December 2026']);
    expect(within(monthly).getAllByRole('cell').map((c) => c.textContent)).toEqual(['0 min', '0 min', '1 h', '0 min', '0 min', '15 min', '0 min', '0 min', '3 h 30 min', '4 h 40 min', '0 min', '0 min']);
    expect(screen.getByText('2026: 9 h 25 min logged, busiest month October with 4 h 40 min.')).toBeInTheDocument();
    // Recharts drew the non-zero bars inside an aria-hidden container.
    expect(screen.getByTestId('chart-monthly').querySelectorAll('.recharts-bar-rectangle').length).toBeGreaterThanOrEqual(4);
    expect(screen.getByTestId('chart-monthly').querySelector('.chart')).toHaveAttribute('aria-hidden', 'true');
  });

  it('selecting Read updates the URL and shows 6 cards: 4.0 h, 25.8 %, 30 min behind (M4-AC5, AC7)', async () => {
    const user = userEvent.setup();
    await withS1();
    const app = await renderApp({ route: '/review', container: tc });
    await screen.findByRole('heading', { level: 1, name: en.review.title });
    await user.selectOptions(await screen.findByRole('combobox', { name: en.review.goalLabel }), 'g1');
    await waitFor(() => expect(app.router.state.location.search).toBe('?goal=g1&year=2026'));
    await waitFor(() => expect(stat('stat-time')).toHaveTextContent('4.0 h'), SLOW);
    expect(stat('stat-time')).toHaveTextContent('In 2026');
    expect(stat('stat-time')).toHaveTextContent('Whole goal: 4.0 h');
    expect(stat('stat-days')).toHaveTextContent('8');
    expect(stat('stat-days')).toHaveTextContent(en.stat.daysOnTargetSub);
    expect(stat('stat-progress')).toHaveTextContent('25.8%');
    expect(stat('stat-progress')).toHaveTextContent('240 of 930 min');
    expect(within(stat('stat-progress')).getByRole('progressbar', { name: en.stat.progress })).toHaveAttribute('aria-valuenow', '25.8');
    expect(stat('stat-pace')).toHaveTextContent('30 min behind');
    expect(stat('stat-pace')).toHaveTextContent('Expected 270 min by today');
    expect(stat('stat-current')).toHaveTextContent('8 days');
    expect(stat('stat-longest')).toHaveTextContent('8 days');
    expect(screen.getByTestId('stats-note')).toHaveTextContent(en.review.progressNote);
    expect(screen.getByRole('grid', { name: 'Activity heatmap for 2026, Read' })).toBeInTheDocument();
    expect(cell('2026-09-30')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('heatmap-summary')).toHaveTextContent('In 2026 you logged time on 8 days and hit your target on 8 days. Longest streak: 8 days.');

    await user.selectOptions(screen.getByRole('combobox', { name: en.review.goalLabel }), 'g2');
    await waitFor(() => expect(stat('stat-pace')).toHaveTextContent('8 h 50 min behind'));
    expect(stat('stat-progress')).toHaveTextContent('10.2%');
    await user.selectOptions(screen.getByRole('combobox', { name: en.review.goalLabel }), 'g3');
    await waitFor(() => expect(stat('stat-progress')).toHaveTextContent('1.0%'));
    expect(stat('stat-pace')).toHaveTextContent('78 h 54 min behind');
    await user.selectOptions(screen.getByRole('combobox', { name: en.review.goalLabel }), 'g4');
    await waitFor(() => expect(stat('stat-pace')).toHaveTextContent(en.stat.paceOnTrack));
    expect(stat('stat-time')).toHaveTextContent('0.0 h');
    expect(screen.getByTestId('heatmap-summary')).toHaveTextContent('No time logged in 2026 yet.');
  });

  it('year 2025 for Read: every cell outside, note "doesn\'t run"; invalid params fall back to All goals / 2026', async () => {
    await withS1();
    const app = await renderApp({ route: '/review?goal=g1&year=2025', container: tc });
    await screen.findByRole('heading', { level: 1, name: en.review.title });
    await waitFor(() => expect(screen.getByRole('combobox', { name: en.review.yearLabel })).toHaveValue('2025'));
    expect(within(screen.getByRole('combobox', { name: en.review.yearLabel })).getAllByRole('option').map((o) => o.textContent)).toEqual(['2026', '2025']);
    expect(screen.getByRole('grid', { name: 'Activity heatmap for 2025, Read' })).toBeInTheDocument();
    expect(document.querySelectorAll('[role="gridcell"]')).toHaveLength(365);
    expect(document.querySelectorAll('[role="gridcell"].out')).toHaveLength(365);
    expect(screen.getByTestId('heatmap-summary')).toHaveTextContent("This goal doesn't run in 2025.");
    expect(screen.getByTestId('stats-note')).toHaveTextContent("This goal doesn't run in 2025.");
    expect(stat('stat-time')).toHaveTextContent('0.0 h');
    expect(stat('stat-time')).toHaveTextContent('Whole goal: 4.0 h');
    app.unmount();

    await renderApp({ route: '/review?goal=xyz&year=abc', container: tc });
    await screen.findByRole('heading', { level: 1, name: en.review.title });
    await waitFor(() => expect(screen.getByRole('combobox', { name: en.review.goalLabel })).toHaveValue('all'));
    expect(screen.getByRole('combobox', { name: en.review.yearLabel })).toHaveValue('2026');
    expect(within(screen.getByRole('combobox', { name: en.review.yearLabel })).getAllByRole('option')).toHaveLength(1);
    await waitFor(() => expect(stat('stat-time')).toHaveTextContent('9.4 h'), SLOW);
  });

  it('clicking a past cell navigates to Day; the year select updates the URL (M4-AC8)', async () => {
    const user = userEvent.setup();
    await withS1();
    const app = await renderApp({ route: '/review', container: tc });
    await screen.findByRole('heading', { level: 1, name: en.review.title });
    await waitFor(() => expect(cell('2026-10-05')).toBeInTheDocument());
    await user.click(cell('2026-10-10'));
    expect(app.router.state.location.pathname).toBe('/review');
    await user.click(cell('2026-10-05'));
    await waitFor(() => expect(app.router.state.location.pathname).toBe('/day/2026-10-05'));
  });

  it('empty state without goals; an archived goal gets the suffix', async () => {
    tc = await createTestContainer();
    const app = await renderApp({ route: '/review', container: tc });
    expect(await screen.findByRole('heading', { level: 2, name: en.empty.review })).toBeInTheDocument();
    expect(screen.getByText(en.empty.reviewBody)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: en.empty.reviewAction })).toHaveAttribute('href', '/goals/new');
    app.unmount();
    await tc.container.db.goals.put(buildGoal({ id: 'a', name: 'Old', archived: true, startDate: '2026-01-01', endDate: '2026-02-01' }));
    await renderApp({ route: '/review', container: tc });
    await screen.findByRole('heading', { level: 1, name: en.review.title });
    await waitFor(() => expect(within(screen.getByRole('combobox', { name: en.review.goalLabel })).getAllByRole('option').map((o) => o.textContent)).toEqual([en.review.goalAll, 'Old (archived)']));
    expect(screen.getByTestId('heatmap-summary')).toHaveTextContent('No time logged in 2026 yet.');
    await chartsReady();
    expect(screen.getAllByText(en.chart.bar.empty)).toHaveLength(2);
  });

  it('tab bar has the Review tab', async () => {
    await withS1();
    await renderApp({ route: '/today', container: tc });
    const nav = await screen.findByRole('navigation', { name: en.nav.label });
    expect(within(nav).getByRole('link', { name: en.nav.review })).toHaveAttribute('href', '/review');
  });
});

describe('Review in vi (M4-AC11)', () => {
  it('Read: 4,0 giờ, 25,8%, Chậm 30 phút; vi labels for heatmap and charts; scan clean', async () => {
    await withS1('vi');
    await renderApp({ route: '/review?goal=g1&year=2026', container: tc });
    expect(await screen.findByRole('heading', { level: 1, name: vi.review.title })).toBeInTheDocument();
    await waitFor(() => expect(stat('stat-time')).toHaveTextContent('4,0 giờ'), SLOW);
    expect(stat('stat-progress')).toHaveTextContent('25,8%');
    expect(stat('stat-pace')).toHaveTextContent('Chậm 30 phút');
    expect(stat('stat-pace')).toHaveTextContent('Dự kiến 270 phút tính đến hôm nay');
    expect(stat('stat-current')).toHaveTextContent('8 ngày');
    expect(screen.getByRole('grid', { name: 'Biểu đồ nhiệt hoạt động năm 2026, Read' })).toBeInTheDocument();
    const monthVi = (m: number) => new Intl.DateTimeFormat('vi-VN', { month: 'short' }).format(new Date(2026, m, 1));
    expect(screen.getAllByTestId('heatmap-month').map((e) => e.textContent)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(monthVi));
    const weekdayVi = (d: number) => new Intl.DateTimeFormat('vi-VN', { weekday: 'short' }).format(new Date(2026, 0, d));
    expect(screen.getAllByTestId('heatmap-weekday').map((e) => e.textContent)).toEqual([5, 6, 7, 8, 9, 10, 11].map(weekdayVi));
    await chartsReady();
    const monthLongVi = (m: number) => new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric' }).format(new Date(2026, m, 1));
    const monthly = screen.getByRole('table', { name: vi.review.monthlyTitle.replace('{{year}}', '2026') });
    expect(within(monthly).getAllByRole('rowheader').map((h) => h.textContent)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(monthLongVi));
    expect(within(monthly).getByRole('columnheader', { name: vi.chart.bar.colTime })).toBeInTheDocument();
    expect(within(monthly).getAllByRole('cell')[9]).toHaveTextContent('4 giờ');
    // Read: the weeks of Sep 28 and Oct 5 tie at 120 min; the first one wins.
    const dateVi = new Intl.DateTimeFormat('vi-VN', { month: 'short', day: 'numeric' }).format(new Date(2026, 8, 28));
    expect(screen.getByText(norm(vi.chart.bar.weeklySummary.replace('{{total}}', '4 giờ').replace('{{date}}', dateVi).replace('{{max}}', '2 giờ')))).toBeInTheDocument();
    const monthName = new Intl.DateTimeFormat('vi-VN', { month: 'long' }).format(new Date(2026, 9, 1));
    expect(screen.getByText(norm(vi.chart.bar.monthlySummary.replace('{{year}}', '2026').replace('{{total}}', '4 giờ').replace('{{month}}', monthName).replace('{{max}}', '4 giờ')))).toBeInTheDocument();
    act(() => cell('2026-10-07').focus());
    expect(screen.getByRole('tooltip')).toHaveTextContent('30 phút');
    expect(scanVi()).toEqual([]);
  });

  it('vi scan: All goals, no goals, year outside the goal, error state', async () => {
    const t1 = await withS1('vi');
    const app = await renderApp({ route: '/review', container: t1 });
    await screen.findByRole('heading', { level: 1, name: vi.review.title });
    await waitFor(() => expect(stat('stat-time')).toHaveTextContent('9,4 giờ'), SLOW);
    await chartsReady();
    expect(screen.getByTestId('stats-note')).toHaveTextContent(vi.review.pickGoal);
    expect(scanVi()).toEqual([]);
    app.unmount();

    const app2 = await renderApp({ route: '/review?goal=g1&year=2025', container: t1 });
    await screen.findByRole('heading', { level: 1, name: vi.review.title });
    await waitFor(() => expect(screen.getByTestId('heatmap-summary')).toHaveTextContent(vi.review.outsideYear.replace('{{year}}', '2025')));
    await chartsReady();
    expect(scanVi()).toEqual([]);
    app2.unmount();

    await t1.container.db.goals.clear();
    await t1.container.db.entries.clear();
    const app3 = await renderApp({ route: '/review', container: t1 });
    await screen.findByRole('heading', { level: 2, name: vi.empty.review });
    expect(scanVi()).toEqual([]);
    app3.unmount();

    // Error state: the repository throws.
    const broken = { ...t1.container, statsService: { watch: () => ({ subscribe: (_n: unknown, onError?: (e: unknown) => void) => { onError?.(new Error('boom')); return () => {}; } }) } } as unknown as typeof t1.container;
    await renderApp({ route: '/review', container: { ...t1, container: broken } });
    expect(await screen.findByRole('heading', { level: 1, name: vi.errors.loadViewTitle })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: vi.common.retry })).toBeInTheDocument();
    expect(scanVi()).toEqual([]);
  });
});
