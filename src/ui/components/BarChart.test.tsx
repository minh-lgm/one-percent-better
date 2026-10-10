// Real Recharts bar chart (static import, see CurveChart.test.tsx). Review mocks it.
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { monthlySeries } from '../../domain/stats';
import { datasetS1, TODAY } from '../../test/builders';
import type { TestContainer } from '../../test/container';
import { renderWithLocale, scanVi } from '../../test/render-with-locale';
import BarChart, { type BarPoint } from './BarChart';

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
