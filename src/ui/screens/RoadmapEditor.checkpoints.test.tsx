// @vitest-environment jsdom
// M20-AC3 (editor part, FR-75, A-91): the Checkpoints section of S14 — add "Mock 3" (max 32, threshold 28) lands in
// date order; lowering the maximum under the score → `range` under the score, nothing saved; locale numbers (vi);
// D11 delete with toast + focus; the 50 cap Alert above the button.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

async function seedQ1(locale: 'en' | 'vi', cp2Score: number | null = null) {
  tc = await createTestContainer({ locale, clock: () => FIXED_NOW_Q1 });
  const d = datasetQ1();
  d.checkpoints[2]!.score = cp2Score;
  await tc.container.db.goals.bulkPut(d.goals);
  await tc.container.db.entries.bulkPut(d.entries);
  await new DexieRoadmapRepository(tc.container.db, { clock: () => FIXED_NOW_Q1 }).putMany({ roadmaps: [d.roadmap], phases: d.phases, items: d.items, checkpoints: d.checkpoints });
  return d;
}

const cpTitles = () => screen.getAllByTestId('editor-checkpoint').map((el) => el.querySelector('b')?.textContent);

describe('RoadmapEditor — checkpoints (M20-AC3)', () => {
  it('en: rows in date order with "date · max · threshold"; Add checkpoint "Mock 3" 2027-03-12 / 32 / 28 → after Mock 2; empty max → max error; Cancel restores focus', async () => {
    const user = userEvent.setup();
    await seedQ1('en');
    await renderApp({ route: '/roadmaps/rq/edit', container: tc });
    const section = await screen.findByTestId('editor-checkpoints');
    expect(within(section).getByRole('heading', { level: 2, name: 'Checkpoints' })).toBeInTheDocument();
    expect(cpTitles()).toEqual(['Diagnostic', 'Checkpoint 1', 'Checkpoint 2', 'Mock 1', 'Mock 2']);
    expect(screen.getAllByTestId('editor-checkpoint')[0]).toHaveTextContent('2026-09-24 · max 32');
    expect(screen.getAllByTestId('editor-checkpoint')[3]).toHaveTextContent('2027-03-01 · max 32 · threshold 24');
    expect(within(section).getByRole('button', { name: 'Edit Mock 1' })).toHaveTextContent('Edit');
    expect(within(section).getByRole('button', { name: 'Delete Mock 1' })).toHaveTextContent('Delete');

    const add = within(section).getByRole('button', { name: 'Add checkpoint' });
    await user.click(add);
    const form = within(screen.getByTestId('cp-form-add'));
    expect(form.getByLabelText(/^Name/)).toHaveFocus();
    expect(form.getByLabelText(/^Date/)).toHaveValue('2026-11-04');
    await user.type(form.getByLabelText(/^Name/), 'Mock 3');
    await user.click(form.getByRole('button', { name: 'Save checkpoint' }));
    expect(await form.findByText('The maximum score must be more than 0 and at most 10,000.')).toBeInTheDocument();
    expect(form.getByLabelText(/^Maximum score/)).toHaveFocus();
    expect(form.getAllByRole('alert')[0]).toHaveTextContent('Fix 1 field to save.');
    fireEvent.change(form.getByLabelText(/^Date/), { target: { value: '2027-03-12' } });
    await user.type(form.getByLabelText(/^Maximum score/), '32');
    await user.type(form.getByLabelText(/^Threshold/), '28');
    await user.click(form.getByRole('button', { name: 'Save checkpoint' }));
    await waitFor(() => expect(screen.queryByTestId('cp-form-add')).toBeNull());
    await waitFor(() => expect(cpTitles()).toEqual(['Diagnostic', 'Checkpoint 1', 'Checkpoint 2', 'Mock 1', 'Mock 2', 'Mock 3']));
    expect(screen.getAllByTestId('editor-checkpoint')[5]).toHaveTextContent('2027-03-12 · max 32 · threshold 28');
    await waitFor(() => expect(add).toHaveFocus());
    // Cancel
    await user.click(within(section).getByRole('button', { name: 'Edit Mock 3' }));
    await user.click(within(screen.getByTestId('cp-form-edit')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(within(section).getByRole('button', { name: 'Edit Mock 3' })).toHaveFocus());
  });

  it('vi: CP2 has 18 → max 10 → range under the score (not saved); max 20 + score "17,5" saves 17.5; delete Mock 2 via D11 → toast + focus on Add', async () => {
    const user = userEvent.setup();
    await seedQ1('vi', 18);
    await renderApp({ route: '/roadmaps/rq/edit', container: tc });
    const section = await screen.findByTestId('editor-checkpoints');
    await user.click(within(section).getByRole('button', { name: 'Sửa Checkpoint 2' }));
    const form = within(screen.getByTestId('cp-form-edit'));
    expect(form.getByLabelText(/^Điểm tối đa/)).toHaveValue('32');
    expect(form.getByLabelText(/^Ngưỡng đạt/)).toHaveValue('20');
    expect(form.getByLabelText(/^Điểm \(không bắt buộc\)/)).toHaveValue('18');
    const max = form.getByLabelText(/^Điểm tối đa/);
    await user.clear(max);
    await user.type(max, '10');
    await user.click(form.getByRole('button', { name: 'Lưu điểm kiểm tra' }));
    // threshold 20 and score 18 are both above 10 → range on both; focus on the first (threshold)
    expect(await form.findAllByText('Hãy nhập một số từ 0 đến điểm tối đa.')).toHaveLength(2);
    expect(form.getByLabelText(/^Điểm \(không bắt buộc\)/)).toHaveAttribute('aria-invalid', 'true');
    expect(form.getByLabelText(/^Ngưỡng đạt/)).toHaveFocus();
    expect((await tc!.container.db.roadmapCheckpoints.get('cq3'))?.maxScore).toBe(32);
    expect(scanVi(screen.getByTestId('cp-form-edit'))).toEqual([]);
    await user.clear(max);
    await user.type(max, '20');
    const score = form.getByLabelText(/^Điểm \(không bắt buộc\)/);
    await user.clear(score);
    await user.type(score, '17,5');
    await user.click(form.getByRole('button', { name: 'Lưu điểm kiểm tra' }));
    await waitFor(() => expect(screen.queryByTestId('cp-form-edit')).toBeNull());
    expect(await tc!.container.db.roadmapCheckpoints.get('cq3')).toMatchObject({ maxScore: 20, threshold: 20, score: 17.5 });
    await waitFor(() => expect(screen.getAllByTestId('editor-checkpoint')[2]).toHaveTextContent('15/02/2027 · tối đa 20 · ngưỡng 20'));

    await user.click(within(section).getByRole('button', { name: 'Xóa Mock 2' }));
    const dlg = within(screen.getByRole('dialog'));
    expect(dlg.getByRole('heading', { name: 'Xóa "Mock 2"?' })).toBeInTheDocument();
    expect(dlg.getByText('Thao tác này xóa điểm kiểm tra và điểm đã ghi. Không thể hoàn tác.')).toBeInTheDocument();
    await user.click(dlg.getByRole('button', { name: 'Xóa điểm kiểm tra' }));
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('Đã xóa điểm kiểm tra'));
    await waitFor(() => expect(cpTitles()).toEqual(['Diagnostic', 'Checkpoint 1', 'Checkpoint 2', 'Mock 1']));
    await waitFor(() => expect(within(section).getByRole('button', { name: 'Thêm điểm kiểm tra' })).toHaveFocus());
  });

  it('no checkpoints → "No checkpoints yet."; at 50 checkpoints Add shows the limit Alert instead of a form', async () => {
    const user = userEvent.setup();
    const d = await seedQ1('en');
    await tc!.container.db.roadmapCheckpoints.toCollection().modify({ deletedAt: '2026-11-04T03:00:00.000Z' });
    await renderApp({ route: '/roadmaps/rq/edit', container: tc });
    const section = await screen.findByTestId('editor-checkpoints');
    expect(section).toHaveTextContent('No checkpoints yet.');
    await tc!.container.db.roadmapCheckpoints.bulkPut(Array.from({ length: 50 }, (_, i) => ({ ...d.checkpoints[0]!, id: `c${i}`, title: `C${i}`, deletedAt: null, dirty: 1 as const })));
    await waitFor(() => expect(screen.getAllByTestId('editor-checkpoint')).toHaveLength(50));
    await user.click(within(section).getByRole('button', { name: 'Add checkpoint' }));
    expect(within(section).getByRole('alert')).toHaveTextContent('A roadmap can have up to 50 checkpoints.');
    expect(screen.queryByTestId('cp-form-add')).toBeNull();
  });
});
