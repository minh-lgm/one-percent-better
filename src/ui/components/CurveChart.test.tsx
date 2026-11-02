// Real Recharts curve chart (static import: the module is loaded before any test
// timer starts, so a cold transform cannot time out — F-D1). The screens mock it.
// M9-AC3 / M9-AC4 (FR-27 v3.0) superseded by the v6.0 burn-up (user decision 2026-11-02):
// "Ideal" = the +1 %-a-day target added up, "You" = minutes logged added up, both in minutes;
// Y scale from `curveYScale` starting at 0; no 0 % reference line; the tooltip/reading of a day
// gives the minutes of that day plus both running totals.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { curve } from '../../domain/curve';
import { buildEntry, datasetO1, datasetR1, datasetR4, datasetS1, TODAY, TODAY_R1 } from '../../test/builders';
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
const LABEL_R1 = 'Day 4 of 83: you have logged 56 min in total. The ideal line is at 122 min.';

// Recharts 3 renders tick labels and reference-dot labels in their own z-index layers (not nested
// under the axis / dot), so select by their own classes.
const yTicks = (chart: HTMLElement) => Array.from(chart.querySelectorAll('.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value')).map((el) => el.textContent ?? '');
/** Direct labels in render order [Ideal, You] with their vertical offset from their dot (−10 = above, +14 = below). */
const labelTexts = (chart: HTMLElement) => {
  const dots = Array.from(chart.querySelectorAll('.recharts-reference-dot circle')).map((c) => Number(c.getAttribute('cy')));
  return Array.from(chart.querySelectorAll('.recharts-label')).map((el, i) => ({ text: el.textContent ?? '', dy: String(Math.round(Number(el.getAttribute('y')) - dots[i])) }));
};
const PLAIN_TICK = /^[\d,.]+$/;

describe('CurveChart v6 (burn-up; DESIGN S4 "Biểu đồ v6")', () => {
  it('R1 whole period: two series, stepped You with a dot on each logged day, no 0 % line, Y from 0 in plain minutes, labels in minutes', async () => {
    const r = await renderWithLocale(<CurveChart ideal={real.ideal} actual={real.actual} label={LABEL_R1} testId="curve-chart" />);
    tc = r.tc;
    const chart = screen.getByTestId('curve-chart');
    expect(chart).toHaveAttribute('role', 'img');
    expect(chart).toHaveAccessibleName(LABEL_R1);
    await waitFor(() => expect(chart.querySelectorAll('.recharts-line')).toHaveLength(2));
    expect(chart.querySelector('.recharts-line-curve[stroke-dasharray]')).not.toBeNull();
    expect(chart.querySelector('.recharts-reference-line.zero-line')).toBeNull();
    expect(chart.querySelectorAll('.recharts-reference-dot')).toHaveLength(2);
    expect(chart.querySelectorAll('.curve-dot')).toHaveLength(4);
    expect(chart.textContent).toContain('Ideal 122 min');
    expect(chart.textContent).toContain('You 56 min');
    const ticks = yTicks(chart);
    expect(ticks[0]).toBe('0');
    expect(ticks).toContain('1,000');
    expect(ticks.every((v) => PLAIN_TICK.test(v))).toBe(true);
    expect(chart).toHaveAttribute('data-y-min', '0');
    // The whole-period ideal (3,852 min on Dec 31) sets the top of the scale.
    expect(Number(chart.getAttribute('data-y-max'))).toBeGreaterThanOrEqual(3852);
    // On that scale 122 vs 56 min are a few pixels apart → Ideal above its dot, You below.
    expect(labelTexts(chart).map((l) => l.dy)).toEqual(['-10', '14']);
    expect(chart.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
  });

  it('R1 so far: scale fits 122 min, both labels above their dots (far apart), ticks are whole minutes', async () => {
    const r = await renderWithLocale(<CurveChart ideal={real.ideal.slice(0, real.elapsedDays)} actual={real.actual} label={LABEL_R1} testId="curve-chart" />);
    tc = r.tc;
    const chart = screen.getByTestId('curve-chart');
    await waitFor(() => expect(chart.querySelectorAll('.recharts-reference-dot')).toHaveLength(2));
    expect(Number(chart.getAttribute('data-y-max'))).toBeGreaterThanOrEqual(122);
    expect(Number(chart.getAttribute('data-y-max'))).toBeLessThan(400);
    expect(labelTexts(chart).map((l) => l.text)).toEqual(['Ideal 122 min', 'You 56 min']);
    expect(labelTexts(chart).map((l) => l.dy)).toEqual(['-10', '-10']);
    expect(yTicks(chart).every((v) => PLAIN_TICK.test(v))).toBe(true);
  });

  it('keyboard reading: today (27 min this day · totals), Oct 12 (14 min · 29 · 91), Home = day 1, End = Ideal only (Dec 31, 3,852 min); Escape/blur clear', async () => {
    const user = userEvent.setup();
    const r = await renderWithLocale(<CurveChart ideal={real.ideal} actual={real.actual} label={LABEL_R1} testId="curve-chart" />);
    tc = r.tc;
    const chart = screen.getByTestId('curve-chart');
    const reading = screen.getByTestId('curve-reading');
    expect(reading).toHaveTextContent('');
    chart.focus();
    await user.keyboard('{ArrowRight}');
    expect(reading).toHaveTextContent('Oct 13 · 27 min this day · Total 56 min · Ideal 122 min');
    await user.keyboard('{ArrowLeft}');
    expect(reading).toHaveTextContent('Oct 12 · 14 min this day · Total 29 min · Ideal 91 min');
    await user.keyboard('{Home}');
    expect(reading).toHaveTextContent('Oct 10 · 5 min this day · Total 5 min · Ideal 30 min');
    await user.keyboard('{End}');
    expect(reading).toHaveTextContent('Dec 31 · Ideal 3,852 min');
    await user.keyboard('{Escape}');
    expect(reading).toHaveTextContent('');
    await user.keyboard('{ArrowRight}');
    expect(reading).toHaveTextContent(/^Oct 13 · 27 min this day/);
    await user.tab();
    // M10 (M9-D1): the line is cleared shortly after blur (after the click that caused it, or ≤ 300 ms), no longer synchronously.
    await waitFor(() => expect(reading).toHaveTextContent(''));
  });

  it('S1 Read: flat today reads "Nothing logged · Total 240 min · Ideal 281 min"; G2 "So far": never below 0, no negative tick, 13 dots', async () => {
    const user = userEvent.setup();
    const r = await renderWithLocale(<CurveChart ideal={read.ideal} actual={read.actual} label="x" testId="curve-chart" />);
    tc = r.tc;
    const chart = screen.getByTestId('curve-chart');
    await waitFor(() => expect(chart.querySelectorAll('.recharts-line')).toHaveLength(2));
    expect(chart.textContent).toContain('You 240 min');
    expect(chart.textContent).toContain('Ideal 281 min');
    chart.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('curve-reading')).toHaveTextContent('Oct 9 · Nothing logged · Total 240 min · Ideal 281 min');
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByTestId('curve-reading')).toHaveTextContent('Oct 8 · 30 min this day · Total 240 min · Ideal 249 min');
    r.unmount();

    const sofar = await renderWithLocale(<CurveChart ideal={guitar.ideal.slice(0, guitar.elapsedDays)} actual={guitar.actual} label="x" testId="curve-chart" />, 'en', { container: tc });
    const g2 = sofar.getByTestId('curve-chart');
    await waitFor(() => expect(g2.querySelectorAll('.recharts-line')).toHaveLength(2));
    expect(g2).toHaveAttribute('data-y-min', '0');
    expect(Number(g2.getAttribute('data-y-max'))).toBeGreaterThanOrEqual(948);
    expect(yTicks(g2).some((v) => /^[-−]/.test(v))).toBe(false);
    expect(g2.querySelector('.recharts-reference-line.zero-line')).toBeNull();
    expect(g2.querySelectorAll('.curve-dot')).toHaveLength(13);
    expect(g2.textContent).toContain('You 250 min');
    expect(g2.textContent).toContain('Ideal 948 min');
  });

  it('big numbers: R4 (1,441 min) labels stay plain; a 100,000-min target gives compact Y labels (≤ 6 characters, K suffix)', async () => {
    const r = await renderWithLocale(<CurveChart ideal={extreme.ideal.slice(0, extreme.elapsedDays)} actual={extreme.actual} label="x" testId="curve-chart" />);
    tc = r.tc;
    const chart = screen.getByTestId('curve-chart');
    await waitFor(() => expect(chart.querySelectorAll('.recharts-line')).toHaveLength(2));
    expect(chart.textContent).toContain('You 1,441 min');
    expect(chart.textContent).toContain('Ideal 60 min');
    expect(yTicks(chart)).toContain('1,000');
    r.unmount();

    const huge = curve({ ...r1.goals[0], targetMinutes: 100_000 }, r1.entries, '2026-10-12');
    const r2 = await renderWithLocale(<CurveChart ideal={huge.ideal.slice(0, huge.elapsedDays)} actual={huge.actual} label="x" testId="curve-chart" />, 'en', { container: tc });
    const chart2 = r2.getByTestId('curve-chart');
    await waitFor(() => expect(chart2.querySelectorAll('.recharts-line')).toHaveLength(2));
    const ticks = yTicks(chart2);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    for (const label of ticks) expect(label.length).toBeLessThanOrEqual(6);
    expect(ticks.some((v) => /K$/.test(v))).toBe(true);
    expect(chart2.textContent).toContain('Ideal 303,010 min');
  });

  it('no logged day yet: You is drawn flat at 0 min with its label and reading; upcoming: Ideal only, no marker at all', async () => {
    const user = userEvent.setup();
    const none = curve(goalOf('g1'), [], TODAY);
    const r = await renderWithLocale(<CurveChart ideal={none.ideal} actual={none.actual} label="x" testId="curve-chart" />);
    tc = r.tc;
    const chart = screen.getByTestId('curve-chart');
    await waitFor(() => expect(chart.querySelectorAll('.recharts-line')).toHaveLength(2));
    expect(chart.querySelectorAll('.recharts-reference-dot')).toHaveLength(2);
    expect(chart.querySelectorAll('.curve-dot')).toHaveLength(0);
    expect(chart.textContent).toContain('Ideal 281 min');
    expect(chart.textContent).toContain('You 0 min');
    chart.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('curve-reading')).toHaveTextContent('Oct 9 · Nothing logged · Total 0 min · Ideal 281 min');
    await user.keyboard('{End}');
    expect(screen.getByTestId('curve-reading')).toHaveTextContent('Oct 31 · Ideal 1,084 min');
    r.unmount();

    const up = await renderWithLocale(<CurveChart ideal={upcoming.ideal} actual={upcoming.actual} label="x" testId="curve-chart" />, 'en', { container: tc });
    const chart2 = up.getByTestId('curve-chart');
    await waitFor(() => expect(chart2.querySelectorAll('.recharts-line-curve').length).toBeGreaterThanOrEqual(1));
    expect(chart2.querySelectorAll('.recharts-line')).toHaveLength(1);
    expect(chart2.querySelectorAll('.recharts-reference-dot')).toHaveLength(0);
    expect(chart2.textContent).not.toContain('You ');
  });

  it('direct labels never overlap: when You is close to Ideal the higher one goes above and the lower below; dots are dropped past 45 points', async () => {
    const goal = goalOf('g1');
    // 275 vs 281.06 min on day 9: a few pixels apart, You below.
    const close = curve(goal, [buildEntry({ id: 'a', goalId: 'g1', date: '2026-10-01', minutes: 100 }), buildEntry({ id: 'b', goalId: 'g1', date: '2026-10-09', minutes: 175 })], TODAY);
    expect(close.headlinePercent).toBe(-2.2);
    const r = await renderWithLocale(<CurveChart ideal={close.ideal.slice(0, close.elapsedDays)} actual={close.actual} label="x" testId="curve-chart" />);
    tc = r.tc;
    const chart = screen.getByTestId('curve-chart');
    await waitFor(() => expect(chart.querySelectorAll('.recharts-reference-dot')).toHaveLength(2));
    const labels = labelTexts(chart);
    expect(labels.map((l) => l.text)).toEqual(['Ideal 281 min', 'You 275 min']);
    expect(labels.map((l) => l.dy)).toEqual(['-10', '14']);
    r.unmount();

    // You above Ideal and close (290 vs 281): You above, Ideal below.
    const above = curve(goal, [buildEntry({ id: 'a', goalId: 'g1', date: '2026-10-01', minutes: 100 }), buildEntry({ id: 'b', goalId: 'g1', date: '2026-10-09', minutes: 190 })], TODAY);
    const r2 = await renderWithLocale(<CurveChart ideal={above.ideal.slice(0, above.elapsedDays)} actual={above.actual} label="x" testId="curve-chart" />, 'en', { container: tc });
    const chart2 = r2.getByTestId('curve-chart');
    await waitFor(() => expect(chart2.querySelectorAll('.recharts-reference-dot')).toHaveLength(2));
    expect(labelTexts(chart2).map((l) => l.text)).toEqual(['Ideal 281 min', 'You 290 min']);
    expect(labelTexts(chart2).map((l) => l.dy)).toEqual(['14', '-10']);
    r2.unmount();

    // 282 You points on screen (G3 whole period so far) → no per-day dots.
    const g3 = curve(goalOf('g3'), entriesOf('g3'), TODAY);
    const r3 = await renderWithLocale(<CurveChart ideal={g3.ideal.slice(0, g3.elapsedDays)} actual={g3.actual} label="x" testId="curve-chart" />, 'en', { container: tc });
    const chart3 = r3.getByTestId('curve-chart');
    await waitFor(() => expect(chart3.querySelectorAll('.recharts-line')).toHaveLength(2));
    expect(chart3.querySelectorAll('.curve-dot')).toHaveLength(0);
  });

  it('vi: direct labels, keyboard reading, ticks use vi copy and formats', async () => {
    const user = userEvent.setup();
    const r = await renderWithLocale(<CurveChart ideal={real.ideal} actual={real.actual} label="Ngày 4/83: bạn đã ghi tổng cộng 56 phút. Đường lý tưởng ở mức 122 phút." testId="curve-chart" />, 'vi');
    tc = r.tc;
    const chart = screen.getByTestId('curve-chart');
    await waitFor(() => expect(chart.textContent).toContain('Lý tưởng 122 phút'));
    expect(chart.textContent).toContain('Bạn 56 phút');
    expect(yTicks(chart)).toContain('1.000');
    chart.focus();
    await user.keyboard('{ArrowRight}');
    const oct13 = new Intl.DateTimeFormat('vi-VN', { month: 'short', day: 'numeric' }).format(new Date(2026, 9, 13));
    expect(screen.getByTestId('curve-reading')).toHaveTextContent(`${oct13} · Ngày này 27 phút · Tổng 56 phút · Lý tưởng 122 phút`);
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByTestId('curve-reading')).toHaveTextContent(/Ngày này 14 phút · Tổng 29 phút · Lý tưởng 91 phút$/);
    await user.keyboard('{Home}');
    expect(screen.getByTestId('curve-reading')).toHaveTextContent(/Ngày này 5 phút · Tổng 5 phút · Lý tưởng 30 phút$/);
    await user.keyboard('{End}');
    expect(screen.getByTestId('curve-reading')).toHaveTextContent(/Lý tưởng 3\.852 phút$/);
    expect(scanVi()).toEqual([]);
    r.unmount();

    const r3 = curve(r1.goals[0], [buildEntry({ id: 'a', goalId: 'r1', date: '2026-10-10', minutes: 5 }), buildEntry({ id: 'b', goalId: 'r1', date: '2026-10-11', minutes: 3 })], '2026-10-11');
    const low = await renderWithLocale(<CurveChart ideal={r3.ideal.slice(0, 2)} actual={r3.actual} label="x" testId="curve-chart" />, 'vi', { container: tc });
    const chart2 = low.getByTestId('curve-chart');
    await waitFor(() => expect(chart2.textContent).toContain('Bạn 8 phút'));
    expect(chart2.textContent).toContain('Lý tưởng 60 phút');
    expect(yTicks(chart2).some((v) => v.startsWith(MINUS))).toBe(false);
    chart2.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('curve-reading')).toHaveTextContent(/Ngày này 3 phút · Tổng 8 phút · Lý tưởng 60 phút$/);
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

// ---- v4.0 (M11, DESIGN S4 rule 6 / A-D59): one point per line sits in the middle of the plot ----
describe('CurveChart — open-ended goal on its first day (M11-T5)', () => {
  it('a single point: both reference dots share one x in the middle of the plot (not on the left edge), labels Ideal 10 min / You 10 min, one X tick', async () => {
    const goal = { ...datasetO1().goals[0], startDate: TODAY };
    const single = curve(goal, [buildEntry({ id: 'x', goalId: 'o1', date: TODAY, minutes: 10 })], TODAY);
    expect(single.ideal).toHaveLength(1);
    const r = await renderWithLocale(<CurveChart ideal={single.ideal} actual={single.actual} label="Day 1" testId="curve-chart" />);
    tc = r.tc;
    const chart = screen.getByTestId('curve-chart');
    await waitFor(() => expect(chart.querySelectorAll('.recharts-reference-dot')).toHaveLength(2));
    const xs = Array.from(chart.querySelectorAll('.recharts-reference-dot circle')).map((c) => Number(c.getAttribute('cx')));
    expect(xs).toHaveLength(2);
    expect(xs[0]).toBe(xs[1]);
    // jsdom width 320, y axis ≥ 44 px, right margin 24 → the plot spans ≈ 44 … 296; the middle is ≈ 170.
    expect(xs[0]).toBeGreaterThan(120);
    expect(xs[0]).toBeLessThan(220);
    expect(chart.textContent).toContain('Ideal 10 min');
    expect(chart.textContent).toContain('You 10 min');
    expect(chart.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick').length + chart.querySelectorAll('.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value').length).toBeGreaterThanOrEqual(1);
  });

  it('nine points (O1 at 2026-10-09): no extra padding, the today dot is at the right edge, You 55 min vs Ideal 94 min, 4 dots', async () => {
    const o1 = datasetO1();
    const c = curve(o1.goals[0], o1.entries, TODAY);
    const r = await renderWithLocale(<CurveChart ideal={c.ideal} actual={c.actual} label="Day 9" testId="curve-chart" />);
    tc = r.tc;
    const chart = screen.getByTestId('curve-chart');
    await waitFor(() => expect(chart.querySelectorAll('.recharts-reference-dot')).toHaveLength(2));
    const xs = Array.from(chart.querySelectorAll('.recharts-reference-dot circle')).map((c) => Number(c.getAttribute('cx')));
    expect(xs[0]).toBeGreaterThan(250);
    expect(chart.textContent).toContain('You 55 min');
    expect(chart.textContent).toContain('Ideal 94 min');
    expect(chart.querySelectorAll('.curve-dot')).toHaveLength(4);
  });
});
