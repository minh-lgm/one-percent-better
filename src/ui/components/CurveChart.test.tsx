// Real Recharts curve chart (static import: the module is loaded before any test
// timer starts, so a cold transform cannot time out — F-D1). The screens mock it.
// M5-AC2 superseded by M9-AC3 / M9-AC4 (FR-27 v3.0): "You" = minutes vs the previous logged
// day, compounded; signed labels; Y scale from `curveYScale`; 0 % reference line.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { curve } from '../../domain/curve';
import { buildEntry, datasetR1, datasetR4, datasetS1, TODAY, TODAY_R1 } from '../../test/builders';
import type { TestContainer } from '../../test/container';
import { renderWithLocale, scanVi } from '../../test/render-with-locale';
import CurveChart, { BLUR_CLEAR_DELAY_MS } from './CurveChart';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

const MINUS = '−';
const s1 = datasetS1();
const goalOf = (id: string) => s1.goals.find((g) => g.id === id)!;
const entriesOf = (id: string) => s1.entries.filter((e) => e.goalId === id);
const read = curve(goalOf('g1'), entriesOf('g1'), TODAY);
const guitar = curve(goalOf('g2'), entriesOf('g2'), TODAY);
const upcoming = curve(goalOf('g4'), [], TODAY);
const r1 = datasetR1();
const real = curve(r1.goals[0], r1.entries, TODAY_R1);
const r4 = datasetR4();
const extreme = curve(r4.goals[0], r4.entries, '2026-10-11');
const LABEL_R1 = 'Day 4 of 83: your line is +440.0% compared with your first logged day. The ideal line is +4.1%.';

// Recharts 3 renders tick labels and reference-dot labels in their own z-index layers (not nested
// under the axis / dot), so select by their own classes.
const yTicks = (chart: HTMLElement) => Array.from(chart.querySelectorAll('.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value')).map((el) => el.textContent ?? '');
/** Direct labels in render order [Ideal, You] with their vertical offset from their dot (−10 = above, +14 = below). */
const labelTexts = (chart: HTMLElement) => {
  const dots = Array.from(chart.querySelectorAll('.recharts-reference-dot circle')).map((c) => Number(c.getAttribute('cy')));
  return Array.from(chart.querySelectorAll('.recharts-label')).map((el, i) => ({ text: el.textContent ?? '', dy: String(Math.round(Number(el.getAttribute('y')) - dots[i])) }));
};

describe('CurveChart v3 (M9-AC3, DESIGN S4 "Biểu đồ v3")', () => {
  it('R1: two series, stepped You with a dot on each logged day, 0 % reference line, Y ticks up to +500%, signed direct labels', async () => {
    const r = await renderWithLocale(<CurveChart ideal={real.ideal} actual={real.actual} label={LABEL_R1} testId="curve-chart" />);
    tc = r.tc;
    const chart = screen.getByTestId('curve-chart');
    expect(chart).toHaveAttribute('role', 'img');
    expect(chart).toHaveAccessibleName(LABEL_R1);
    await waitFor(() => expect(chart.querySelectorAll('.recharts-line')).toHaveLength(2));
    expect(chart.querySelector('.recharts-line-curve[stroke-dasharray]')).not.toBeNull();
    expect(chart.querySelector('.recharts-reference-line.zero-line')).not.toBeNull();
    expect(chart.querySelectorAll('.recharts-reference-dot')).toHaveLength(2);
    expect(chart.querySelectorAll('.curve-dot')).toHaveLength(4);
    expect(chart.textContent).toContain('Ideal +4.1%');
    expect(chart.textContent).toContain('You +440.0%');
    const ticks = yTicks(chart);
    expect(ticks).toContain('0%');
    expect(ticks).toContain('+500%');
    expect(ticks.every((v) => v === '0%' || v.startsWith('+'))).toBe(true);
    expect(chart).toHaveAttribute('data-y-min', '0');
    expect(Number(chart.getAttribute('data-y-max'))).toBeGreaterThanOrEqual(440);
    // Far apart → both labels sit above their dots.
    expect(labelTexts(chart).map((l) => l.dy)).toEqual(['-10', '-10']);
    expect(chart.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
  });

  it('keyboard reading: today (change), Oct 12 (14 min, +40.0%, +180.0%), Home = first logged day, End = Ideal only; Escape/blur clear', async () => {
    const user = userEvent.setup();
    const r = await renderWithLocale(<CurveChart ideal={real.ideal} actual={real.actual} label={LABEL_R1} testId="curve-chart" />);
    tc = r.tc;
    const chart = screen.getByTestId('curve-chart');
    const reading = screen.getByTestId('curve-reading');
    expect(reading).toHaveTextContent('');
    chart.focus();
    await user.keyboard('{ArrowRight}');
    expect(reading).toHaveTextContent('Oct 13 · 27 min, +92.9% vs previous logged day · You +440.0% since your first day · Ideal +4.1%');
    await user.keyboard('{ArrowLeft}');
    expect(reading).toHaveTextContent('Oct 12 · 14 min, +40.0% vs previous logged day · You +180.0% since your first day · Ideal +3.0%');
    await user.keyboard('{Home}');
    expect(reading).toHaveTextContent('Oct 10 · 5 min, your first logged day · You +0.0% · Ideal +1.0%');
    await user.keyboard('{End}');
    expect(reading).toHaveTextContent('Dec 31 · Ideal +128.4%');
    await user.keyboard('{Escape}');
    expect(reading).toHaveTextContent('');
    await user.keyboard('{ArrowRight}');
    expect(reading).toHaveTextContent(/^Oct 13 · 27 min/);
    await user.tab();
    // M10 (M9-D1): the line is cleared shortly after blur (after the click that caused it, or ≤ 300 ms), no longer synchronously.
    await waitFor(() => expect(reading).toHaveTextContent(''));
  });

  it('S1 Read: flat today reads "Nothing logged, the line stays flat"; G2 "So far": negative tick and a domain below −50', async () => {
    const user = userEvent.setup();
    const r = await renderWithLocale(<CurveChart ideal={read.ideal} actual={read.actual} label="x" testId="curve-chart" />);
    tc = r.tc;
    const chart = screen.getByTestId('curve-chart');
    await waitFor(() => expect(chart.querySelectorAll('.recharts-line')).toHaveLength(2));
    expect(chart.textContent).toContain('You +0.0%');
    expect(chart.textContent).toContain('Ideal +9.4%');
    chart.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('curve-reading')).toHaveTextContent('Oct 9 · Nothing logged, the line stays flat · You +0.0% · Ideal +9.4%');
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByTestId('curve-reading')).toHaveTextContent('Oct 8 · 30 min, +0.0% vs previous logged day · You +0.0% since your first day · Ideal +8.3%');
    r.unmount();

    const sofar = await renderWithLocale(<CurveChart ideal={guitar.ideal.slice(0, guitar.elapsedDays)} actual={guitar.actual} label="x" testId="curve-chart" />, 'en', { container: tc });
    const g2 = sofar.getByTestId('curve-chart');
    await waitFor(() => expect(g2.querySelectorAll('.recharts-line')).toHaveLength(2));
    expect(Number(g2.getAttribute('data-y-min'))).toBeLessThanOrEqual(-50);
    expect(yTicks(g2).some((v) => /^[-−]/.test(v))).toBe(true);
    expect(yTicks(g2).some((v) => v.startsWith(MINUS))).toBe(true);
    expect(g2.querySelector('.recharts-reference-line.zero-line')).not.toBeNull();
    expect(g2.querySelectorAll('.curve-dot')).toHaveLength(13);
  });

  it('R4 (+143,900 %): every Y label is at most 8 characters (compact notation)', async () => {
    const r = await renderWithLocale(<CurveChart ideal={extreme.ideal.slice(0, extreme.elapsedDays)} actual={extreme.actual} label="x" testId="curve-chart" />);
    tc = r.tc;
    const chart = screen.getByTestId('curve-chart');
    await waitFor(() => expect(chart.querySelectorAll('.recharts-line')).toHaveLength(2));
    const ticks = yTicks(chart);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    for (const label of ticks) expect(label.length).toBeLessThanOrEqual(8);
    expect(ticks.some((v) => /K%$/.test(v))).toBe(true);
    expect(chart.textContent).toContain('You +143,900.0%');
  });

  it('no logged day yet: only the Ideal line and marker, no You label, Ideal-only reading; upcoming: no marker at all', async () => {
    const user = userEvent.setup();
    const none = curve(goalOf('g1'), [], TODAY);
    const r = await renderWithLocale(<CurveChart ideal={none.ideal} actual={none.actual} label="x" testId="curve-chart" />);
    tc = r.tc;
    const chart = screen.getByTestId('curve-chart');
    await waitFor(() => expect(chart.querySelectorAll('.recharts-line')).toHaveLength(1));
    expect(chart.querySelectorAll('.recharts-reference-dot')).toHaveLength(1);
    expect(chart.querySelector('.recharts-reference-line.zero-line')).not.toBeNull();
    expect(chart.querySelectorAll('.curve-dot')).toHaveLength(0);
    expect(chart.textContent).toContain('Ideal +9.4%');
    expect(chart.textContent).not.toContain('You ');
    chart.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('curve-reading')).toHaveTextContent('Oct 9 · Ideal +9.4%');
    r.unmount();

    const up = await renderWithLocale(<CurveChart ideal={upcoming.ideal} actual={upcoming.actual} label="x" testId="curve-chart" />, 'en', { container: tc });
    const chart2 = up.getByTestId('curve-chart');
    await waitFor(() => expect(chart2.querySelectorAll('.recharts-line-curve').length).toBeGreaterThanOrEqual(1));
    expect(chart2.querySelectorAll('.recharts-reference-dot')).toHaveLength(0);
  });

  it('direct labels never overlap: when You is close to Ideal the higher one goes above and the lower below; dots are dropped past 45 points', async () => {
    const goal = goalOf('g1');
    const close = curve(goal, [buildEntry({ id: 'a', goalId: 'g1', date: '2026-10-01', minutes: 100 }), buildEntry({ id: 'b', goalId: 'g1', date: '2026-10-09', minutes: 109 })], TODAY);
    expect(close.headlinePercent).toBe(9);
    const r = await renderWithLocale(<CurveChart ideal={close.ideal.slice(0, close.elapsedDays)} actual={close.actual} label="x" testId="curve-chart" />);
    tc = r.tc;
    const chart = screen.getByTestId('curve-chart');
    await waitFor(() => expect(chart.querySelectorAll('.recharts-reference-dot')).toHaveLength(2));
    const labels = labelTexts(chart);
    expect(labels.map((l) => l.text)).toEqual(['Ideal +9.4%', 'You +9.0%']);
    expect(labels.map((l) => l.dy)).toEqual(['-10', '14']);
    r.unmount();

    // You above Ideal and close: You above, Ideal below.
    const above = curve(goal, [buildEntry({ id: 'a', goalId: 'g1', date: '2026-10-01', minutes: 100 }), buildEntry({ id: 'b', goalId: 'g1', date: '2026-10-09', minutes: 110 })], TODAY);
    const r2 = await renderWithLocale(<CurveChart ideal={above.ideal.slice(0, above.elapsedDays)} actual={above.actual} label="x" testId="curve-chart" />, 'en', { container: tc });
    const chart2 = r2.getByTestId('curve-chart');
    await waitFor(() => expect(chart2.querySelectorAll('.recharts-reference-dot')).toHaveLength(2));
    expect(labelTexts(chart2).map((l) => l.dy)).toEqual(['14', '-10']);
    r2.unmount();

    // 282 You points on screen (G3 whole period so far) → no per-day dots.
    const g3 = curve(goalOf('g3'), entriesOf('g3'), TODAY);
    const r3 = await renderWithLocale(<CurveChart ideal={g3.ideal.slice(0, g3.elapsedDays)} actual={g3.actual} label="x" testId="curve-chart" />, 'en', { container: tc });
    const chart3 = r3.getByTestId('curve-chart');
    await waitFor(() => expect(chart3.querySelectorAll('.recharts-line')).toHaveLength(2));
    expect(chart3.querySelectorAll('.curve-dot')).toHaveLength(0);
  });

  it('vi: direct labels, keyboard reading, ticks use vi copy and formats (M9-AC5)', async () => {
    const user = userEvent.setup();
    const r = await renderWithLocale(<CurveChart ideal={real.ideal} actual={real.actual} label="Ngày 4/83: đường của bạn ở mức +440,0% so với ngày có ghi đầu tiên." testId="curve-chart" />, 'vi');
    tc = r.tc;
    const chart = screen.getByTestId('curve-chart');
    await waitFor(() => expect(chart.textContent).toContain('Lý tưởng +4,1%'));
    expect(chart.textContent).toContain('Bạn +440,0%');
    expect(yTicks(chart)).toContain('+500%');
    chart.focus();
    await user.keyboard('{ArrowRight}');
    const oct13 = new Intl.DateTimeFormat('vi-VN', { month: 'short', day: 'numeric' }).format(new Date(2026, 9, 13));
    expect(screen.getByTestId('curve-reading')).toHaveTextContent(`${oct13} · 27 phút, +92,9% so với ngày có ghi trước · Bạn +440,0% so với ngày đầu · Lý tưởng +4,1%`);
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByTestId('curve-reading')).toHaveTextContent(/14 phút, \+40,0% so với ngày có ghi trước · Bạn \+180,0% so với ngày đầu · Lý tưởng \+3,0%$/);
    await user.keyboard('{Home}');
    expect(screen.getByTestId('curve-reading')).toHaveTextContent(/5 phút, ngày có ghi đầu tiên · Bạn \+0,0% · Lý tưởng \+1,0%$/);
    await user.keyboard('{End}');
    expect(screen.getByTestId('curve-reading')).toHaveTextContent(/Lý tưởng \+128,4%$/);
    expect(scanVi()).toEqual([]);
    r.unmount();

    const r3 = curve(r1.goals[0], [buildEntry({ id: 'a', goalId: 'r1', date: '2026-10-10', minutes: 5 }), buildEntry({ id: 'b', goalId: 'r1', date: '2026-10-11', minutes: 3 })], '2026-10-11');
    const down = await renderWithLocale(<CurveChart ideal={r3.ideal.slice(0, 2)} actual={r3.actual} label="x" testId="curve-chart" />, 'vi', { container: tc });
    const chart2 = down.getByTestId('curve-chart');
    await waitFor(() => expect(chart2.textContent).toContain(`Bạn ${MINUS}40,0%`));
    expect(yTicks(chart2).some((v) => v.startsWith(MINUS))).toBe(true);
    expect(scanVi()).toEqual([]);
  });
});

describe('M9-D1: the reading line survives the mouse press that blurs the chart (M10-AC8)', () => {
  it('blur keeps the reading until the click that caused it has been dispatched, then clears it', async () => {
    const user = userEvent.setup();
    const r = await renderWithLocale(<CurveChart ideal={real.ideal} actual={real.actual} label={LABEL_R1} testId="curve-chart" />);
    tc = r.tc;
    const chart = screen.getByTestId('curve-chart');
    const reading = screen.getByTestId('curve-reading');
    chart.focus();
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(reading).toHaveTextContent(/^Oct 12 · 14 min/);
    // mousedown on a <summary> elsewhere blurs the chart first…
    fireEvent.blur(chart);
    expect(reading).toHaveTextContent(/^Oct 12 · 14 min/);
    // …then the click arrives; only after it is dispatched does the line go.
    fireEvent.click(document.body);
    expect(reading).toHaveTextContent(/^Oct 12 · 14 min/);
    await waitFor(() => expect(reading).toHaveTextContent(''));
  });

  it('blur without any click (Tab away) clears the reading within the fallback delay; refocus + arrow cancels a pending clear', async () => {
    const user = userEvent.setup();
    const r = await renderWithLocale(<CurveChart ideal={real.ideal} actual={real.actual} label={LABEL_R1} testId="curve-chart" />);
    tc = r.tc;
    const chart = screen.getByTestId('curve-chart');
    const reading = screen.getByTestId('curve-reading');
    chart.focus();
    await user.keyboard('{ArrowRight}');
    expect(reading).toHaveTextContent(/^Oct 13/);
    const started = Date.now();
    fireEvent.blur(chart);
    await waitFor(() => expect(reading).toHaveTextContent(''), { timeout: 1000 });
    expect(Date.now() - started).toBeLessThan(1000);

    chart.focus();
    await user.keyboard('{ArrowRight}');
    expect(reading).toHaveTextContent(/^Oct 13/);
    fireEvent.blur(chart);
    chart.focus();
    await user.keyboard('{ArrowLeft}');
    await new Promise((resolve) => setTimeout(resolve, BLUR_CLEAR_DELAY_MS + 50));
    expect(reading).toHaveTextContent(/^Oct 12/);
  });
});

describe('M10-D4: a press held longer than the fallback delay keeps the reading until it is released', () => {
  it('pointerdown → blur → 400 ms later the line is still there; pointerup + click → cleared', async () => {
    const user = userEvent.setup();
    const r = await renderWithLocale(<CurveChart ideal={real.ideal} actual={real.actual} label={LABEL_R1} testId="curve-chart" />);
    tc = r.tc;
    const chart = screen.getByTestId('curve-chart');
    const reading = screen.getByTestId('curve-reading');
    chart.focus();
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(reading).toHaveTextContent(/^Oct 12/);
    fireEvent.pointerDown(document.body);
    fireEvent.blur(chart);
    await new Promise((resolve) => setTimeout(resolve, BLUR_CLEAR_DELAY_MS + 100));
    expect(reading).toHaveTextContent(/^Oct 12/);
    fireEvent.pointerUp(document.body);
    fireEvent.click(document.body);
    await waitFor(() => expect(reading).toHaveTextContent(''));
  });

  it('a press released elsewhere without a click still clears the line after the delay', async () => {
    const user = userEvent.setup();
    const r = await renderWithLocale(<CurveChart ideal={real.ideal} actual={real.actual} label={LABEL_R1} testId="curve-chart" />);
    tc = r.tc;
    const chart = screen.getByTestId('curve-chart');
    const reading = screen.getByTestId('curve-reading');
    chart.focus();
    await user.keyboard('{ArrowRight}');
    fireEvent.pointerDown(document.body);
    fireEvent.blur(chart);
    fireEvent.pointerCancel(document.body);
    await waitFor(() => expect(reading).toHaveTextContent(''), { timeout: 1000 });
  });
});
