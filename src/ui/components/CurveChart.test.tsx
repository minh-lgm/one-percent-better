// Real Recharts curve chart (static import: the module is loaded before any test
// timer starts, so a cold transform cannot time out — F-D1). The screens mock it.
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { curve } from '../../domain/curve';
import { datasetS1, TODAY } from '../../test/builders';
import type { TestContainer } from '../../test/container';
import { renderWithLocale, scanVi } from '../../test/render-with-locale';
import CurveChart from './CurveChart';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

const s1 = datasetS1();
const read = curve(s1.goals.find((g) => g.id === 'g1')!, s1.entries.filter((e) => e.goalId === 'g1'), TODAY);
const upcoming = curve(s1.goals.find((g) => g.id === 'g4')!, [], TODAY);
const LABEL = 'Day 9 of 31: you are +8.3% better. The ideal line is +9.4%. You hit your target on 8 of 9 days.';

describe('CurveChart (M5-AC2, DESIGN §8 charts)', () => {
  it('draws the dashed Ideal line, the stepped You line, the today marker with direct labels, inside an accessible figure', async () => {
    const r = await renderWithLocale(<CurveChart ideal={read.ideal} actual={read.actual} label={LABEL} testId="curve-chart" />);
    tc = r.tc;
    const chart = screen.getByTestId('curve-chart');
    expect(chart).toHaveAttribute('role', 'img');
    expect(chart).toHaveAccessibleName(LABEL);
    await waitFor(() => expect(chart.querySelectorAll('.recharts-line')).toHaveLength(2));
    expect(chart.querySelector('.recharts-line-curve[stroke-dasharray]')).not.toBeNull();
    expect(chart.querySelector('.recharts-reference-line')).not.toBeNull();
    expect(chart.querySelectorAll('.recharts-reference-dot')).toHaveLength(2);
    expect(chart.textContent).toContain('Ideal +9.4%');
    expect(chart.textContent).toContain('You +8.3%');
    // The SVG is hidden from assistive tech; the wrapper carries the name.
    expect(chart.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
  });

  it('keyboard reading: ArrowRight reads today, ArrowLeft moves back a day, Home/End, Escape clears; blur clears', async () => {
    const user = userEvent.setup();
    const r = await renderWithLocale(<CurveChart ideal={read.ideal} actual={read.actual} label={LABEL} testId="curve-chart" />);
    tc = r.tc;
    const chart = screen.getByTestId('curve-chart');
    const reading = screen.getByTestId('curve-reading');
    expect(reading).toHaveTextContent('');
    chart.focus();
    await user.keyboard('{ArrowRight}');
    expect(reading).toHaveTextContent('Oct 9 · Ideal +9.4% · You +8.3%');
    await user.keyboard('{ArrowLeft}');
    expect(reading).toHaveTextContent('Oct 8 · Ideal +8.3% · You +8.3%');
    await user.keyboard('{End}');
    expect(reading).toHaveTextContent('Oct 31 · Ideal +36.1%');
    await user.keyboard('{Home}');
    expect(reading).toHaveTextContent('Oct 1 · Ideal +1.0% · You +1.0%');
    await user.keyboard('{Escape}');
    expect(reading).toHaveTextContent('');
    await user.keyboard('{ArrowRight}');
    expect(reading).toHaveTextContent('Oct 9 · Ideal +9.4% · You +8.3%');
    await user.tab();
    expect(reading).toHaveTextContent('');
  });

  it('upcoming goal: only the Ideal line, no today marker; "So far" slice keeps the series in sync', async () => {
    const r = await renderWithLocale(<CurveChart ideal={upcoming.ideal} actual={upcoming.actual} label="x" testId="curve-chart" />);
    tc = r.tc;
    const chart = screen.getByTestId('curve-chart');
    await waitFor(() => expect(chart.querySelectorAll('.recharts-line-curve').length).toBeGreaterThanOrEqual(1));
    expect(chart.querySelectorAll('.recharts-reference-dot')).toHaveLength(0);
    r.unmount();
    const sofar = await renderWithLocale(<CurveChart ideal={read.ideal.slice(0, read.elapsedDays)} actual={read.actual} label={LABEL} testId="curve-chart" />, 'en', { container: tc });
    await waitFor(() => expect(sofar.getByTestId('curve-chart').querySelectorAll('.recharts-reference-dot')).toHaveLength(2));
  });

  it('vi: direct labels, keyboard reading and tooltip strings use vi copy and formats', async () => {
    const user = userEvent.setup();
    const r = await renderWithLocale(<CurveChart ideal={read.ideal} actual={read.actual} label="Ngày 9/31: bạn đã tốt hơn +8,3%." testId="curve-chart" />, 'vi');
    tc = r.tc;
    const chart = screen.getByTestId('curve-chart');
    await waitFor(() => expect(chart.textContent).toContain('Lý tưởng +9,4%'));
    expect(chart.textContent).toContain('Bạn +8,3%');
    chart.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('curve-reading')).toHaveTextContent('Lý tưởng +9,4% · Bạn +8,3%');
    await user.keyboard('{End}');
    expect(screen.getByTestId('curve-reading')).toHaveTextContent(/Lý tưởng \+36,1%$/);
    expect(scanVi()).toEqual([]);
  });
});
