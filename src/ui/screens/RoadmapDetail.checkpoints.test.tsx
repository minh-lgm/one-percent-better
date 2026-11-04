// @vitest-environment jsdom
// M20-AC3 (component level, FR-75, A-91): the Checkpoints section of the detail on dataset Q1 — table rows in date
// order with the week / date column and thresholds, quick score entry in the locale format (vi `7,5`), the inline
// `range` error, clearing → pending, and the plain-SVG chart (5 columns, Diagnostic 5/32, threshold ticks, SR summary,
// percent scale when the maxima differ).
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi as vitest } from 'vitest';
import { DexieRoadmapRepository } from '../../data/dexie/roadmap-repo';
import { datasetQ1, FIXED_NOW_Q1 } from '../../test/builders';
import { createTestContainer, type TestContainer } from '../../test/container';
import { renderApp, scanVi } from '../../test/render-with-locale';

let tc: TestContainer | undefined;

beforeEach(() => {
  vitest.setSystemTime(FIXED_NOW_Q1);
});
afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

async function seedQ1(locale: 'en' | 'vi') {
  tc = await createTestContainer({ locale, clock: () => FIXED_NOW_Q1 });
  const d = datasetQ1();
  await tc.container.db.goals.bulkPut(d.goals);
  await tc.container.db.entries.bulkPut(d.entries);
  await new DexieRoadmapRepository(tc.container.db, { clock: () => FIXED_NOW_Q1 }).putMany({ roadmaps: [d.roadmap], phases: d.phases, items: d.items, checkpoints: d.checkpoints });
  return d;
}

const rows = () => screen.getAllByTestId('cp-row');
const rowOf = (id: string) => within(document.querySelector(`[data-testid="cp-row"][data-cp="${id}"]`) as HTMLElement);
const stored = async (id: string) => (await tc!.container.db.roadmapCheckpoints.get(id))?.score;

async function typeScore(id: string, text: string) {
  const input = rowOf(id).getByTestId('cp-score');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.blur(input);
}

describe('RoadmapDetail — checkpoints (M20-AC3)', () => {
  it('vi Q1: 5 rows by date; Diagnostic 24/09/2026 (outside → date), CP1 W8 + note, CP2 ≥ 20; CP2 18 → Dưới ngưỡng −2, 21 → Đạt +1, 7,5 → 7.5, 33 → range, cleared → Chưa có điểm; scan clean', async () => {
    await seedQ1('vi');
    await renderApp({ route: '/roadmaps/rq', container: tc });
    const section = await screen.findByTestId('checkpoints');
    expect(within(section).getByRole('heading', { level: 2, name: 'Điểm kiểm tra' })).toBeInTheDocument();
    expect(within(section).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Mốc', 'Ngưỡng', 'Điểm']);
    expect(rows().map((r) => r.querySelector('.cp-n')?.textContent)).toEqual(['Diagnostic', 'Checkpoint 1', 'Checkpoint 2', 'Mock 1', 'Mock 2']);
    expect(rows().map((r) => within(r).getByTestId('cp-when').textContent)).toEqual(['24/09/2026', 'W8', 'W16', 'W18', 'W19']);
    expect(rowOf('cq2').getByTestId('cp-note')).toHaveTextContent('≥ 3/4 mỗi mảng LA, Calc');
    expect(rows().map((r) => within(r).getByTestId('cp-threshold').textContent)).toEqual(['—', '—', '≥ 20', '≥ 24', '≥ 26']);
    // Diagnostic 5, no threshold → recorded; the input shows 5 and is named after the checkpoint
    expect(rowOf('cq1').getByRole('textbox', { name: 'Điểm của Diagnostic (trên 32)' })).toHaveValue('5');
    expect(rowOf('cq1').getByTestId('cp-state')).toHaveTextContent('Đã ghi');
    expect(rowOf('cq3').getByTestId('cp-state')).toHaveTextContent('Chưa có điểm');
    expect(rowOf('cq3').getByText('/ 32')).toBeInTheDocument();

    await typeScore('cq3', '18');
    await waitFor(() => expect(rowOf('cq3').getByTestId('cp-state')).toHaveTextContent('Dưới ngưỡng'));
    expect(rowOf('cq3').getByTestId('cp-delta')).toHaveTextContent('−2');
    expect(rowOf('cq3').getByTestId('cp-state')).toHaveAttribute('data-state', 'below');
    expect(await stored('cq3')).toBe(18);
    expect(screen.getByTestId('detail-status')).toHaveTextContent('Đã lưu điểm của Checkpoint 2');

    // Enter saves too
    const cp2 = rowOf('cq3').getByTestId('cp-score');
    fireEvent.change(cp2, { target: { value: '21' } });
    fireEvent.keyDown(cp2, { key: 'Enter' });
    await waitFor(() => expect(rowOf('cq3').getByTestId('cp-state')).toHaveTextContent('Đạt'));
    expect(rowOf('cq3').getByTestId('cp-delta')).toHaveTextContent('+1');

    // vi decimal comma
    await typeScore('cq4', '7,5');
    await waitFor(async () => expect(await stored('cq4')).toBe(7.5));
    await waitFor(() => expect(rowOf('cq4').getByTestId('cp-delta')).toHaveTextContent('−16,5'));
    expect(rowOf('cq4').getByTestId('cp-score')).toHaveValue('7,5');

    // above the maximum → range, inline, nothing saved, the typed value stays
    await typeScore('cq5', '33');
    const err = await rowOf('cq5').findByRole('alert');
    expect(err).toHaveTextContent('Hãy nhập một số từ 0 đến điểm tối đa.');
    const input5 = rowOf('cq5').getByTestId('cp-score');
    expect(input5).toHaveAttribute('aria-invalid', 'true');
    expect(input5).toHaveAttribute('aria-describedby', err.id);
    expect(input5).toHaveValue('33');
    expect(await stored('cq5')).toBeNull();
    // two decimals → precision
    await typeScore('cq5', '7,25');
    await waitFor(() => expect(rowOf('cq5').getByRole('alert')).toHaveTextContent('Dùng tối đa một chữ số thập phân (ví dụ 7,5).'));

    // clear → pending
    await typeScore('cq3', '');
    await waitFor(() => expect(rowOf('cq3').getByTestId('cp-state')).toHaveTextContent('Chưa có điểm'));
    expect(await stored('cq3')).toBeNull();
    expect(scanVi(section)).toEqual([]);
  });

  it('en chart: 5 columns in date order, Diagnostic 5/32 high, threshold ticks on CP2 / Mock 1 / Mock 2, SR summary names every checkpoint; raw scale; legend', async () => {
    await seedQ1('en');
    await renderApp({ route: '/roadmaps/rq', container: tc });
    const chart = await screen.findByTestId('cp-chart');
    expect(chart).toHaveAttribute('data-scale', 'raw');
    expect(within(chart).getByText('Scores vs. thresholds')).toBeInTheDocument();
    const cols = within(chart).getAllByTestId('cp-col');
    expect(cols.map((c) => c.getAttribute('data-cp'))).toEqual(['cq1', 'cq2', 'cq3', 'cq4', 'cq5']);
    const diag = cols[0]!.querySelector('rect')!;
    expect(diag.getAttribute('data-state')).toBe('recorded');
    expect(Number(diag.getAttribute('data-height'))).toBeCloseTo(5 / 32, 3);
    expect(cols.map((c) => c.querySelectorAll('[data-testid="cp-threshold-line"]').length)).toEqual([0, 0, 1, 1, 1]);
    expect(cols.slice(1).every((c) => c.querySelector('rect')!.getAttribute('data-state') === 'pending')).toBe(true);
    const svg = within(chart).getByRole('img');
    expect(svg).toHaveAccessibleName(
      '5 checkpoints, in date order. Diagnostic: 5 of 32, no threshold; Checkpoint 1: no score yet; Checkpoint 2: no score yet; Mock 1: no score yet; Mock 2: no score yet',
    );
    expect(chart.querySelector('.cp-lgd')).toHaveTextContent('PassedBelow thresholdRecordedNo score yetThreshold');
    expect(within(chart).queryByTestId('cp-scale-note')).toBeNull();
    // CP2 18 → hatched "below" bar and the summary says so
    fireEvent.change(screen.getAllByTestId('cp-score')[2]!, { target: { value: '18' } });
    fireEvent.blur(screen.getAllByTestId('cp-score')[2]!);
    await waitFor(() => expect(within(screen.getByTestId('cp-chart')).getAllByTestId('cp-col')[2]!.querySelector('rect')).toHaveAttribute('data-state', 'below'));
    expect(within(screen.getByTestId('cp-chart')).getByRole('img')).toHaveAccessibleName(/Checkpoint 2: 18 of 32, threshold 20, below threshold/);
  });

  it('a checkpoint with max 100 → percent scale with the note; the bars are % of each maximum; no checkpoints → no section', async () => {
    const d = await seedQ1('en');
    await tc!.container.db.roadmapCheckpoints.put({ ...d.checkpoints[4]!, id: 'cq6', title: 'IELTS mock', date: '2027-03-12', maxScore: 100, threshold: 60, score: 75, deletedAt: null, dirty: 1 });
    await renderApp({ route: '/roadmaps/rq', container: tc });
    const chart = await screen.findByTestId('cp-chart');
    expect(chart).toHaveAttribute('data-scale', 'percent');
    expect(within(chart).getByTestId('cp-scale-note')).toHaveTextContent("Scores are shown as a percent of each checkpoint's maximum.");
    const cols = within(chart).getAllByTestId('cp-col');
    expect(cols).toHaveLength(6);
    expect(Number(cols[5]!.querySelector('rect')!.getAttribute('data-height'))).toBeCloseTo(0.75, 3);
    expect(Number(cols[0]!.querySelector('rect')!.getAttribute('data-height'))).toBeCloseTo(5 / 32, 3);
    expect(within(chart).getByText('100%')).toBeInTheDocument();
    // remove every checkpoint → the section is gone
    await tc!.container.db.roadmapCheckpoints.toCollection().modify({ deletedAt: '2026-11-04T03:00:00.000Z' });
    await waitFor(() => expect(screen.queryByTestId('checkpoints')).toBeNull());
  });
});
