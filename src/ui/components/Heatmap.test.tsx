import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi as vitest } from 'vitest';
import { buildHeatmap } from '../../domain/heatmap';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import { datasetS1, TODAY } from '../../test/builders';
import type { TestContainer } from '../../test/container';
import { renderWithLocale, scanVi } from '../../test/render-with-locale';
import { Heatmap } from './Heatmap';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

const s1 = datasetS1();
const allGrid = () => buildHeatmap({ year: 2026, goal: null, goals: s1.goals, entries: s1.entries, today: TODAY });
const cell = (date: string) => document.querySelector<HTMLElement>(`[data-date="${date}"]`)!;

describe('Heatmap (M4-AC3, M4-AC8, DESIGN §8)', () => {
  it('is a grid of 7 rows with named gridcells; 2026-10-07 reads date, 50 min and target met', async () => {
    const onSelect = vitest.fn();
    const r = await renderWithLocale(<Heatmap grid={allGrid()} mode="all" goalName={en.review.goalAll} onSelect={onSelect} />);
    tc = r.tc;
    const grid = screen.getByRole('grid', { name: 'Activity heatmap for 2026, All goals' });
    expect(grid).toHaveAttribute('aria-rowcount', '7');
    expect(within(grid).getAllByRole('row')).toHaveLength(7);
    expect(within(grid).getAllByRole('gridcell')).toHaveLength(365);
    expect(cell('2026-10-07')).toHaveAccessibleName('Wednesday, October 7, 2026: 50 min, target met');
    expect(cell('2026-09-15')).toHaveAccessibleName('Tuesday, September 15, 2026: 10 min, target not met');
    expect(cell('2026-10-09')).toHaveAccessibleName('Friday, October 9, 2026: no time logged');
    expect(cell('2026-10-10')).toHaveAccessibleName('Saturday, October 10, 2026: upcoming');
    expect(cell('2026-10-10')).toHaveAttribute('aria-disabled', 'true');
    expect(cell('2026-10-07')).not.toHaveAttribute('aria-disabled');
    expect(cell('2026-10-09')).toHaveClass('today');
    // One tab stop: today.
    const stops = within(grid).getAllByRole('gridcell').filter((c) => c.getAttribute('tabindex') === '0');
    expect(stops).toHaveLength(1);
    expect(stops[0]).toBe(cell('2026-10-09'));
    // Padding cells outside the year are hidden from AT.
    expect(document.querySelectorAll('.cell.sp[aria-hidden="true"]').length).toBe(53 * 7 - 365);
    // Weekday labels start on Monday, month labels use monthShort.
    expect(screen.getAllByTestId('heatmap-weekday').map((e) => e.textContent)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(screen.getAllByTestId('heatmap-month').map((e) => e.textContent)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
    expect(screen.getByText(en.heatmap.legendLess)).toBeInTheDocument();
    expect(screen.getByText(en.heatmap.legendAll)).toBeInTheDocument();
  });

  it('keyboard: Tab reaches today, arrows move by week/day, Home/End, Enter opens Day, future cells do not navigate', async () => {
    const user = userEvent.setup();
    const onSelect = vitest.fn();
    const r = await renderWithLocale(
      <>
        <button type="button">before</button>
        <Heatmap grid={allGrid()} mode="all" goalName={en.review.goalAll} onSelect={onSelect} />
      </>,
    );
    tc = r.tc;
    await user.click(screen.getByRole('button', { name: 'before' }));
    await user.tab();
    expect(cell('2026-10-09')).toHaveFocus();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Friday, October 9, 2026: no time logged');
    await user.keyboard('{ArrowLeft}');
    expect(cell('2026-10-02')).toHaveFocus();
    expect(cell('2026-10-02')).toHaveAttribute('tabindex', '0');
    expect(cell('2026-10-09')).toHaveAttribute('tabindex', '-1');
    await user.keyboard('{ArrowUp}');
    expect(cell('2026-10-01')).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(cell('2026-10-03')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(cell('2026-10-10')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onSelect).not.toHaveBeenCalled(); // future
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(cell('2026-09-26')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenLastCalledWith('2026-09-26');
    await user.keyboard(' ');
    expect(onSelect).toHaveBeenCalledTimes(2);
    await user.keyboard('{Home}');
    expect(cell('2026-01-01')).toHaveFocus();
    await user.keyboard('{ArrowUp}'); // nothing before Jan 1
    expect(cell('2026-01-01')).toHaveFocus();
    await user.keyboard('{End}');
    expect(cell('2026-12-31')).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(cell('2026-12-31')).toHaveFocus();
    // Sunday → Monday of the next week on ArrowDown.
    await user.keyboard('{Home}{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(cell('2026-01-04')).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(cell('2026-01-05')).toHaveFocus();
    await user.tab();
    expect(screen.getByTestId('heatmap-tooltip')).toHaveAttribute('hidden');
  });

  it('click opens Day for a past day only; hover shows the tooltip', async () => {
    const user = userEvent.setup();
    const onSelect = vitest.fn();
    const r = await renderWithLocale(<Heatmap grid={allGrid()} mode="all" goalName={en.review.goalAll} onSelect={onSelect} />);
    tc = r.tc;
    await user.hover(cell('2026-10-05'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Monday, October 5, 2026: 30 min, target met');
    await user.click(cell('2026-10-05'));
    expect(onSelect).toHaveBeenCalledWith('2026-10-05');
    await user.click(cell('2026-12-25'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('one goal: outside cells are disabled and named; vi names use dateLong with year and vi strings (M4-AC11)', async () => {
    const g1 = s1.goals[0];
    const grid = buildHeatmap({ year: 2026, goal: g1, goals: s1.goals, entries: s1.entries, today: TODAY });
    const r = await renderWithLocale(<Heatmap grid={grid} mode="goal" goalName={g1.name} onSelect={() => {}} />, 'vi');
    tc = r.tc;
    const dateVi = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    expect(screen.getByRole('grid')).toHaveAccessibleName(`Biểu đồ nhiệt hoạt động năm 2026, Read`);
    expect(cell('2026-10-07')).toHaveAccessibleName(vi.heatmap.cell.goalMet.replace('{{date}}', dateVi.format(new Date(2026, 9, 7))).replace('{{minutes}}', '30 phút'));
    expect(cell('2026-09-30')).toHaveAccessibleName(vi.heatmap.cell.outside.replace('{{date}}', dateVi.format(new Date(2026, 8, 30))));
    expect(cell('2026-09-30')).toHaveAttribute('aria-disabled', 'true');
    const weekdayVi = (d: Date) => new Intl.DateTimeFormat('vi-VN', { weekday: 'short' }).format(d);
    expect(screen.getAllByTestId('heatmap-weekday').map((e) => e.textContent)).toEqual([5, 6, 7, 8, 9, 10, 11].map((d) => weekdayVi(new Date(2026, 0, d))));
    const monthVi = (m: number) => new Intl.DateTimeFormat('vi-VN', { month: 'short' }).format(new Date(2026, m, 1));
    expect(screen.getAllByTestId('heatmap-month').map((e) => e.textContent)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(monthVi));
    expect(screen.getByText(vi.heatmap.legendGoal)).toBeInTheDocument();
    act(() => cell('2026-10-07').focus());
    expect(screen.getByRole('tooltip')).toHaveTextContent('30 phút');
    expect(scanVi()).toEqual([]);
  });

  it('All goals in vi: 2026-10-07 uses heatmap.cell.all with 50 phút', async () => {
    const r = await renderWithLocale(<Heatmap grid={allGrid()} mode="all" goalName={vi.review.goalAll} onSelect={() => {}} />, 'vi');
    tc = r.tc;
    const dateVi = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(2026, 9, 7));
    expect(cell('2026-10-07')).toHaveAccessibleName(vi.heatmap.cell.all.replace('{{date}}', dateVi).replace('{{minutes}}', '50 phút'));
    expect(scanVi()).toEqual([]);
  });
});
