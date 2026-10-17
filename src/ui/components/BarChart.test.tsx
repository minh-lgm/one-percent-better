// Real Recharts bar chart (static import, see CurveChart.test.tsx). Review mocks it.
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi as vitest } from 'vitest';
import { monthlySeries } from '../../domain/stats';
import { datasetS1, TODAY } from '../../test/builders';
import type { TestContainer } from '../../test/container';
import { renderWithLocale, scanVi } from '../../test/render-with-locale';
import BarChart, { barLabelsFit, type BarPoint } from './BarChart';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const points: BarPoint[] = monthlySeries(datasetS1().entries, 2026, TODAY).map((m) => ({ key: m.date, tick: MONTHS[m.month - 1], label: `${MONTHS[m.month - 1]} 2026`, minutes: m.minutes, current: m.current }));

describe('BarChart (M4-AC6, DESIGN §8 charts)', () => {
  it('draws one bar per non-zero month inside an aria-hidden box; figure caption and hidden table carry the data', async () => {
    const r = await renderWithLocale(<BarChart points={points} caption="Months of 2026" columnHeader="Month" summary="2026: 9 h 25 min logged" testId="chart-monthly" />);
    tc = r.tc;
    const figure = screen.getByTestId('chart-monthly');
    await waitFor(() => expect(figure.querySelectorAll('.recharts-bar-rectangle').length).toBeGreaterThanOrEqual(4));
    expect(figure.querySelector('.chart')).toHaveAttribute('aria-hidden', 'true');
    expect(figure.querySelector('svg.recharts-surface')).not.toBeNull();
    expect(screen.getByText('2026: 9 h 25 min logged')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Months of 2026' });
    expect(within(table).getAllByRole('row')).toHaveLength(13);
    expect(within(table).getAllByRole('cell').map((c) => c.textContent)).toEqual(['0 min', '0 min', '1 h', '0 min', '0 min', '15 min', '0 min', '0 min', '3 h 30 min', '4 h 40 min', '0 min', '0 min']);
  });

  it('vi: table header and durations use vi copy', async () => {
    const r = await renderWithLocale(<BarChart points={points} caption="Các tháng của năm 2026" columnHeader="Tháng" summary="x" testId="chart-monthly" />, 'vi');
    tc = r.tc;
    await waitFor(() => expect(screen.getByTestId('chart-monthly').querySelector('svg.recharts-surface')).not.toBeNull());
    const table = screen.getByRole('table', { name: 'Các tháng của năm 2026' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Tháng', 'Thời gian đã ghi']);
    expect(within(table).getAllByRole('cell')[9]).toHaveTextContent('4 giờ 40 phút');
    expect(scanVi()).toEqual([]);
  });
});

describe('value labels on the columns (M10-AC11, DESIGN S6 v3.1, M4-P1b)', () => {
  /** jsdom has no layout: make `.chart` report the width a real viewport would give. */
  function chartWidth(px: number) {
    vitest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('chart') ? px : 0;
    });
  }
  afterEach(() => {
    vitest.restoreAllMocks();
  });

  it('rule 1: labels fit from 398 px (slot ≥ 30 px over 12 columns)', () => {
    expect(barLabelsFit(397)).toBe(false);
    expect(barLabelsFit(398)).toBe(true);
    expect(barLabelsFit(296)).toBe(false);
    expect(barLabelsFit(416)).toBe(true);
  });

  it('360 px viewport (chart ≈ 296 px): no label at all', async () => {
    chartWidth(296);
    const r = await renderWithLocale(<BarChart points={points} caption="Months of 2026" columnHeader="Month" summary="x" testId="chart-monthly" />);
    tc = r.tc;
    const figure = screen.getByTestId('chart-monthly');
    await waitFor(() => expect(figure.querySelectorAll('.recharts-bar-rectangle').length).toBeGreaterThanOrEqual(4));
    expect(figure.querySelectorAll('[data-testid="bar-value"]')).toHaveLength(0);
  });

  it('1440 px viewport (chart ≈ 416 px): every column ≥ 3 min has a label in hours without unit (en 1.0 / 0.3 / 3.5 / 4.7), aria-hidden, none for 0-minute columns; vi uses a decimal comma', async () => {
    chartWidth(416);
    const r = await renderWithLocale(<BarChart points={points} caption="Months of 2026" columnHeader="Month" summary="x" testId="chart-monthly" />);
    tc = r.tc;
    const figure = screen.getByTestId('chart-monthly');
    await waitFor(() => expect(figure.querySelectorAll('[data-testid="bar-value"]').length).toBe(4));
    const labels = Array.from(figure.querySelectorAll('[data-testid="bar-value"]'));
    expect(labels.map((l) => l.textContent)).toEqual(['1.0', '0.3', '3.5', '4.7']);
    for (const l of labels) {
      expect(l.closest('[aria-hidden="true"]')).not.toBeNull();
      expect(l.getAttribute('text-anchor')).toBe('middle');
      expect(l.getAttribute('font-weight')).toBe('600');
    }
    // The current month (October) is drawn with the text colour, the others muted.
    expect(labels[3].getAttribute('fill')).toBe('var(--text)');
    expect(labels[0].getAttribute('fill')).toBe('var(--text-muted)');
    // Hidden table and caption unchanged.
    expect(within(screen.getByRole('table', { name: 'Months of 2026' })).getAllByRole('row')).toHaveLength(13);
  });

  it('vi at 416 px: labels use a decimal comma; no leaks', async () => {
    chartWidth(416);
    const r = await renderWithLocale(<BarChart points={points} caption="Các tháng của năm 2026" columnHeader="Tháng" summary="x" testId="chart-monthly" />, 'vi');
    tc = r.tc;
    await waitFor(() => expect(screen.getByTestId('chart-monthly').querySelectorAll('[data-testid="bar-value"]').length).toBe(4));
    expect(Array.from(screen.getByTestId('chart-monthly').querySelectorAll('[data-testid="bar-value"]')).map((l) => l.textContent)).toEqual(['1,0', '0,3', '3,5', '4,7']);
    expect(scanVi()).toEqual([]);
  });

  it('≥ 100 h is shown as a whole number; 1–2 minutes get no label', async () => {
    chartWidth(416);
    const big: BarPoint[] = points.map((p, i) => ({ ...p, minutes: i === 0 ? 744 * 60 : i === 1 ? 2 : i === 2 ? 3 : 0 }));
    const r = await renderWithLocale(<BarChart points={big} caption="Months of 2026" columnHeader="Month" summary="x" testId="chart-monthly" />);
    tc = r.tc;
    const figure = screen.getByTestId('chart-monthly');
    await waitFor(() => expect(figure.querySelectorAll('[data-testid="bar-value"]').length).toBe(2));
    expect(Array.from(figure.querySelectorAll('[data-testid="bar-value"]')).map((l) => l.textContent)).toEqual(['744', '0.1']);
  });
});
