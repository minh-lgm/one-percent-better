// @vitest-environment jsdom
// M19-AC4 / AC5 / AC7 (component level): create an empty roadmap (Demo M19), the editor's phase/item actions with
// keyboard reordering, the delete dialogs, the goal picker (A-78) and its errors from the `roadmap` namespace.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi as vitest } from 'vitest';
import { DexieRoadmapRepository } from '../../data/dexie/roadmap-repo';
import { buildEntry, datasetQ1, datasetS1, FIXED_NOW_Q1 } from '../../test/builders';
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

async function withS1(locale: 'en' | 'vi' = 'en') {
  tc = await createTestContainer({ locale, clock: () => FIXED_NOW_Q1 });
  const { goals, entries } = datasetS1();
  await tc.container.db.goals.bulkPut(goals);
  await tc.container.db.entries.bulkPut(entries);
  return tc;
}

async function withQ1(locale: 'en' | 'vi' = 'en') {
  tc = await createTestContainer({ locale, clock: () => FIXED_NOW_Q1 });
  const d = datasetQ1();
  await tc.container.db.goals.bulkPut(d.goals);
  await tc.container.db.entries.bulkPut(d.entries);
  await new DexieRoadmapRepository(tc.container.db, { clock: () => FIXED_NOW_Q1 }).putMany({ roadmaps: [d.roadmap], phases: d.phases, items: d.items, checkpoints: d.checkpoints });
  return tc;
}

const editorItems = () => screen.getAllByTestId('editor-item');
const itemTitles = () => editorItems().map((el) => el.querySelector('b')?.textContent);

describe('RoadmapNew → RoadmapEditor (Demo M19, M19-AC4)', () => {
  it('creates "Spanish B1" linked to Spanish (5 h/week, Exam 2027-06-01), adds a phase and 3 items with suggested dates, moves item 3 to the top (focus stays on its button), Done → detail 0/3 with 3 cells', async () => {
    const user = userEvent.setup();
    await withS1();
    const app = await renderApp({ route: '/roadmaps/new', container: tc });
    expect(await screen.findByRole('heading', { level: 1, name: 'New roadmap' })).toBeInTheDocument();
    const form = await screen.findByRole('form', { name: 'New roadmap form' });
    await user.type(within(form).getByLabelText(/^Title/), 'Spanish B1');
    const picker = within(form).getByLabelText('Linked goal (optional)');
    await waitFor(() => expect(within(picker).getAllByRole('option').length).toBeGreaterThan(1));
    await user.selectOptions(picker, 'g3');
    await user.type(within(form).getByLabelText(/^Weekly study target/), '5');
    await user.type(within(form).getByLabelText(/^Milestone name/), 'Exam');
    fireEvent.change(within(form).getByLabelText(/^Milestone date/), { target: { value: '2027-06-01' } });
    await user.click(within(form).getByRole('button', { name: 'Create roadmap' }));
    await waitFor(() => expect(app.router.state.location.pathname).toMatch(/^\/roadmaps\/[^/]+\/edit$/));
    const id = app.router.state.location.pathname.split('/')[2];
    expect(await screen.findByRole('heading', { level: 1, name: 'Edit roadmap' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('Roadmap created'));
    const stored = await tc!.container.db.roadmaps.get(id);
    expect(stored).toMatchObject({ title: 'Spanish B1', goalId: 'g3', weeklyTargetMinutes: 300, milestoneLabel: 'Exam', milestoneDate: '2027-06-01' });
    expect(screen.getByText('No phases yet. Add a phase, then add items to it.')).toBeInTheDocument();

    // Add phase "Grammar"
    await user.click(screen.getByRole('button', { name: 'Add phase' }));
    const phaseForm = screen.getByTestId('phase-form-add');
    expect(within(phaseForm).getByLabelText(/^Phase title/)).toHaveFocus();
    await user.type(within(phaseForm).getByLabelText(/^Phase title/), 'Grammar');
    await user.click(within(phaseForm).getByRole('button', { name: 'Save phase' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 3, name: 'Grammar' })).toBeInTheDocument());
    expect(screen.queryByTestId('phase-form-add')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add phase' })).toHaveFocus();

    // Add 3 items: the suggestion is 7 days right after the last item (A-83); the first starts today.
    const expectedRanges = [
      ['2026-11-04', '2026-11-10'],
      ['2026-11-11', '2026-11-17'],
      ['2026-11-18', '2026-11-24'],
    ];
    for (const [i, title] of ['Present tenses', 'Past tenses', 'Subjunctive'].entries()) {
      await user.click(screen.getByRole('button', { name: 'Add item' }));
      const itemForm = screen.getByTestId('item-form-add');
      expect(within(itemForm).getByLabelText(/^Planned start/)).toHaveValue(expectedRanges[i][0]);
      expect(within(itemForm).getByLabelText(/^Planned end/)).toHaveValue(expectedRanges[i][1]);
      expect(within(itemForm).getByText('We suggested 7 days right after the last item. Change them if you need to.')).toBeInTheDocument();
      await user.type(within(itemForm).getByLabelText(/^Item title/), title);
      await user.click(within(itemForm).getByRole('button', { name: 'Save item' }));
      await waitFor(() => expect(editorItems()).toHaveLength(i + 1));
    }
    expect(itemTitles()).toEqual(['Present tenses', 'Past tenses', 'Subjunctive']);
    expect(editorItems()[0]).toHaveTextContent('2026-11-04 – 11-10');
    expect(editorItems()[2]).toHaveTextContent('2026-11-18 – 11-24');

    // Move "Subjunctive" up twice with the keyboard; the focus stays on its own "up" button each time.
    const up = () => screen.getByRole('button', { name: 'Move Subjunctive up' });
    await user.click(up());
    await waitFor(() => expect(itemTitles()).toEqual(['Present tenses', 'Subjunctive', 'Past tenses']));
    await waitFor(() => expect(document.activeElement).toBe(up()));
    expect(screen.getByTestId('editor-status')).toHaveTextContent('Subjunctive moved to position 2 of 3');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(itemTitles()).toEqual(['Subjunctive', 'Present tenses', 'Past tenses']));
    await waitFor(() => expect(document.activeElement).toBe(up()));
    expect(up()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Move Past tenses down' })).toHaveAttribute('aria-disabled', 'true');
    // Dates did not move with the items (A-83).
    expect(editorItems()[0]).toHaveTextContent('2026-11-18 – 11-24');

    // Done → detail with 0/3, 3 cells, this week = Present tenses (contains today)
    await user.click(screen.getByTestId('editor-done'));
    await waitFor(() => expect(app.router.state.location.pathname).toBe(`/roadmaps/${id}`));
    expect(await screen.findByRole('heading', { level: 1, name: 'Spanish B1' })).toBeInTheDocument();
    expect(within(screen.getByTestId('overview')).getByTestId('done-value')).toHaveTextContent('0/3');
    expect(screen.getAllByTestId('strip-cell')).toHaveLength(3);
    expect(within(screen.getByTestId('this-week')).getByRole('heading', { level: 3 })).toHaveTextContent('Present tenses');
    expect(within(screen.getByTestId('overview')).getByTestId('hours-sub')).toHaveTextContent('Planned through this week: 5 h');
    expect(within(screen.getByTestId('overview')).getByTestId('metric-milestone')).toHaveTextContent('Exam');
  });

  it('validation: empty title → "Enter a title." + focus + summary; target 0.3 → ROADMAP_TARGET_INVALID; item end before start → order error; vi scan on the new form', async () => {
    const user = userEvent.setup();
    await withS1('vi');
    await renderApp({ route: '/roadmaps/new', container: tc });
    expect(await screen.findByRole('heading', { level: 1, name: 'Lộ trình mới' })).toBeInTheDocument();
    const form = await screen.findByRole('form', { name: 'Biểu mẫu lộ trình mới' });
    await waitFor(() => expect(within(within(form).getByLabelText(/^Mục tiêu liên kết/)).getAllByRole('option').length).toBeGreaterThan(1));
    expect(scanVi()).toEqual([]);
    await user.type(within(form).getByLabelText(/^Chỉ tiêu giờ học mỗi tuần/), '0,3');
    await user.click(within(form).getByRole('button', { name: 'Tạo lộ trình' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('Hãy sửa 2 ô để lưu.');
    expect(within(form).getByText('Hãy nhập tiêu đề.')).toBeInTheDocument();
    expect(within(form).getByText('Nhập số giờ mỗi tuần từ 0,5 đến 168, theo bước 0,5.')).toBeInTheDocument();
    expect(within(form).getByLabelText(/^Tiêu đề/)).toHaveFocus();
    expect(within(form).getByLabelText(/^Tiêu đề/)).toHaveAttribute('aria-invalid', 'true');
    expect(await tc!.container.db.roadmaps.count()).toBe(0);
    expect(scanVi()).toEqual([]);
  });

  it('editor: item end before start → ROADMAP_DATE_INVALID_order under Planned end, focus there; Cancel closes and returns focus to Edit', async () => {
    const user = userEvent.setup();
    await withQ1();
    await renderApp({ route: '/roadmaps/rq/edit', container: tc });
    expect(await screen.findByRole('heading', { level: 1, name: 'Edit roadmap' })).toBeInTheDocument();
    await waitFor(() => expect(editorItems()).toHaveLength(21));
    const edit = screen.getByRole('button', { name: 'Edit Solving systems: elimination, row echelon form, rank' });
    await user.click(edit);
    const form = screen.getByTestId('item-form-edit');
    expect(within(form).getByLabelText(/^Item title/)).toHaveFocus();
    fireEvent.change(within(form).getByLabelText(/^Planned end/), { target: { value: '2026-11-01' } });
    await user.click(within(form).getByRole('button', { name: 'Save item' }));
    expect(await within(form).findByText("The end date can't be before the start date.")).toBeInTheDocument();
    expect(within(form).getByLabelText(/^Planned end/)).toHaveFocus();
    expect((await tc!.container.db.roadmapItems.get('wq2'))?.plannedEnd).toBe('2026-11-09');
    await user.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('item-form-edit')).toBeNull();
    await waitFor(() => expect(edit).toHaveFocus());
  });

  it('move an item to another phase through the Phase select; delete a phase with 2 items (dialog says 2; Cancel keeps, Confirm removes both); delete the roadmap → /roadmaps + toast', async () => {
    const user = userEvent.setup();
    await withQ1();
    const app = await renderApp({ route: '/roadmaps/rq/edit', container: tc });
    expect(await screen.findByRole('heading', { level: 1, name: 'Edit roadmap' })).toBeInTheDocument();
    await waitFor(() => expect(editorItems()).toHaveLength(21));
    // W4 → Phase 2 (goes to the end of phase 2)
    await user.click(screen.getByRole('button', { name: 'Edit Determinants in depth & eigenvectors: basis, span, eigenvalue, PCA' }));
    await user.selectOptions(within(screen.getByTestId('item-form-edit')).getByLabelText('Phase'), 'pq2');
    await user.click(within(screen.getByTestId('item-form-edit')).getByRole('button', { name: 'Save item' }));
    await waitFor(() => expect(screen.queryByTestId('item-form-edit')).toBeNull());
    const phase2 = screen.getAllByTestId('editor-phase')[1];
    await waitFor(() => expect(within(phase2).getAllByTestId('editor-item')).toHaveLength(5));
    expect(within(phase2).getAllByTestId('editor-item').at(-1)).toHaveTextContent('Determinants in depth');
    expect(within(screen.getAllByTestId('editor-phase')[0]).getAllByTestId('editor-item')).toHaveLength(3);

    // Delete phase 3 (4 items) → dialog names the count; Cancel keeps it.
    await user.click(screen.getByRole('button', { name: 'Delete phase Phase 3 · Probability & Statistics' }));
    let dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Delete phase "Phase 3 · Probability & Statistics"?');
    expect(dialog).toHaveTextContent("This deletes the phase and its 4 items. This can't be undone.");
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus());
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getAllByTestId('editor-phase')).toHaveLength(5);
    // Make phase 5 hold 2 items, then delete it: both items go.
    await tc!.container.db.roadmapItems.bulkDelete(['wq17', 'wq18', 'wq19']);
    await waitFor(() => expect(within(screen.getAllByTestId('editor-phase')[4]).getAllByTestId('editor-item')).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: 'Delete phase Phase 5 · Lấp lỗ hổng & thi QPT' }));
    dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent("This deletes the phase and its 2 items. This can't be undone.");
    await user.click(within(dialog).getByRole('button', { name: 'Delete phase' }));
    await waitFor(() => expect(screen.getAllByTestId('editor-phase')).toHaveLength(4));
    expect(editorItems()).toHaveLength(16);
    expect((await tc!.container.db.roadmapItems.get('wq20'))?.deletedAt).toBeTruthy();
    expect(screen.getByTestId('toast')).toHaveTextContent('Phase deleted');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add phase' })).toHaveFocus());

    // Delete the roadmap (D8 names the counts) → list + toast.
    await user.click(screen.getByRole('button', { name: 'Delete roadmap' }));
    dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Delete "QPT 21 tuần"?');
    expect(dialog).toHaveTextContent("This deletes the roadmap with its 4 phases, 16 items and 5 checkpoints. Your goal and its entries are not affected. This can't be undone.");
    await user.click(within(dialog).getByRole('button', { name: 'Delete roadmap' }));
    await waitFor(() => expect(app.router.state.location.pathname).toBe('/roadmaps'));
    expect(await screen.findByTestId('roadmaps-empty')).toBeInTheDocument();
    expect(screen.getByTestId('toast')).toHaveTextContent('Roadmap deleted');
    expect((await tc!.container.db.roadmaps.get('rq'))?.deletedAt).toBeTruthy();
    expect((await tc!.container.db.goals.get('gq'))?.deletedAt).toBeFalsy();
  });

  it('regression: going from one editor straight to another never seeds the form with the previous roadmap (stale emission)', async () => {
    await withQ1();
    const service = await tc!.container.loadRoadmapService();
    const r2 = await service.create({ title: 'Reading plan', note: '', goalId: 'g1', weeklyTargetHours: null, milestoneLabel: '', milestoneDate: null });
    if (!r2.ok) throw new Error('create failed');
    const app = await renderApp({ route: `/roadmaps/${r2.value.id}/edit`, container: tc });
    await screen.findByRole('heading', { level: 1, name: 'Edit roadmap' });
    await waitFor(() => expect(screen.getByLabelText('Linked goal (optional)')).toHaveValue('g1'));
    await app.router.navigate('/roadmaps/rq/edit');
    await waitFor(() => expect(screen.getByLabelText(/^Title/)).toHaveValue('QPT 21 tuần'));
    await waitFor(() => expect(screen.getByLabelText('Linked goal (optional)')).toHaveValue('gq'));
    await waitFor(() => expect(editorItems()).toHaveLength(21));
  });

  it('unknown id → "Big goal not found"', async () => {
    await withS1();
    await renderApp({ route: '/roadmaps/nope/edit', container: tc });
    expect(await screen.findByRole('heading', { level: 1, name: 'Big goal not found' })).toBeInTheDocument();
  });
});

describe('Goal picker (M19-AC5, A-78)', () => {
  it('rq: lists No goal, gq (its own) and the free goals; not g1 (linked to another roadmap) nor g2 (archived); switching to g3 counts g3 entries; unlinking → "—"', async () => {
    const user = userEvent.setup();
    await withQ1();
    await tc!.container.db.goals.update('g2', { archived: true });
    const service = await tc!.container.loadRoadmapService();
    const r2 = await service.create({ title: 'Other', note: '', goalId: 'g1', weeklyTargetHours: null, milestoneLabel: '', milestoneDate: null });
    expect(r2.ok).toBe(true);
    await tc!.container.db.entries.put(buildEntry({ id: 'e-g3-w2', goalId: 'g3', date: '2026-11-03', minutes: 100 }));

    const app = await renderApp({ route: '/roadmaps/rq/edit', container: tc });
    expect(await screen.findByRole('heading', { level: 1, name: 'Edit roadmap' })).toBeInTheDocument();
    const picker = screen.getByLabelText('Linked goal (optional)');
    await waitFor(() => expect(within(picker).getAllByRole('option').length).toBeGreaterThan(1));
    const values = within(picker).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
    expect(values[0]).toBe('');
    expect(values).toHaveLength(5); // No goal, gq, g3, g4, g5
    expect(values).toContain('gq');
    expect(values).toContain('g3');
    expect(values).not.toContain('g1');
    expect(values).not.toContain('g2');
    expect(picker).toHaveValue('gq');
    expect(screen.getByText("Study time is counted from this goal's entries. Archived goals and goals already used by another roadmap aren't listed.")).toBeInTheDocument();

    await user.selectOptions(picker, 'g3');
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('Roadmap saved'));
    expect((await tc!.container.db.roadmaps.get('rq'))?.goalId).toBe('g3');
    await user.click(screen.getByTestId('editor-done'));
    await waitFor(() => expect(app.router.state.location.pathname).toBe('/roadmaps/rq'));
    await screen.findByRole('heading', { level: 1, name: 'QPT 21 tuần' });
    // g3's only entry inside the roadmap: 100 min on 11-03 (W2) → 1.7 h; the 60 min of 03-02 is outside.
    expect(within(screen.getByTestId('overview')).getByTestId('hours-value')).toHaveTextContent('1.7 h');
    expect(within(screen.getByTestId('this-week')).getByTestId('this-week-minutes')).toHaveTextContent('100/480 min');

    // Unlink → "—"
    await user.click(screen.getByTestId('detail-edit'));
    await screen.findByRole('heading', { level: 1, name: 'Edit roadmap' });
    const picker2 = screen.getByLabelText('Linked goal (optional)');
    await waitFor(() => expect(picker2).toHaveValue('g3'));
    await user.selectOptions(picker2, '');
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    await waitFor(() => expect((tc!.container.db.roadmaps.get('rq')).then((r) => r?.goalId)).resolves.toBeNull());
    await user.click(screen.getByTestId('editor-done'));
    await screen.findByRole('heading', { level: 1, name: 'QPT 21 tuần' });
    expect(within(screen.getByTestId('overview')).getByTestId('hours-value')).toHaveTextContent('—');
    expect(screen.getByTestId('detail-goal')).toHaveTextContent('No goal linked');
  });

  it('errors under the picker from the roadmap namespace: ROADMAP_GOAL_ALREADY_LINKED names the other roadmap; GOAL_NOT_FOUND when the goal vanished before saving', async () => {
    const user = userEvent.setup();
    await withQ1();
    const service = await tc!.container.loadRoadmapService();
    const r2 = await service.create({ title: 'Portfolio', note: '', goalId: null, weeklyTargetHours: null, milestoneLabel: '', milestoneDate: null });
    if (!r2.ok) throw new Error('create failed');
    await renderApp({ route: `/roadmaps/${r2.value.id}/edit`, container: tc });
    expect(await screen.findByRole('heading', { level: 1, name: 'Edit roadmap' })).toBeInTheDocument();
    const picker = screen.getByLabelText('Linked goal (optional)');
    await waitFor(() => expect(within(picker).getAllByRole('option').length).toBeGreaterThan(1));
    // g3 is free when the picker loads; another device links it to rq before we save.
    await user.selectOptions(picker, 'g3');
    expect((await service.setGoalLink('rq', 'g3')).ok).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    expect(await screen.findByText('This goal is already linked to "QPT 21 tuần". Choose another goal, or unlink it there first.')).toBeInTheDocument();
    expect(picker).toHaveAttribute('aria-invalid', 'true');
    expect(picker).toHaveFocus();
    // g4 is deleted (elsewhere) before saving → the roadmap copy, not "This goal doesn't exist anymore."
    await user.selectOptions(picker, 'g4');
    await tc!.container.db.goals.update('g4', { deletedAt: '2026-11-04T03:00:00.000Z' });
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    expect(await screen.findByText("That goal doesn't exist anymore. Choose another goal, or leave this empty.")).toBeInTheDocument();
    expect((await tc!.container.db.roadmaps.get(r2.value.id))?.goalId).toBeNull();
  });

  it('ROADMAP_LIMIT_REACHED_item: the 201st Add item shows the alert above the button and opens no form', async () => {
    const user = userEvent.setup();
    await withQ1();
    const db = tc!.container.db;
    const base = (await db.roadmapItems.get('wq21'))!;
    await db.roadmapItems.bulkPut(Array.from({ length: 179 }, (_, i) => ({ ...base, id: `extra-${i}`, position: 100 + i, title: `Extra ${i}` })));
    await renderApp({ route: '/roadmaps/rq/edit', container: tc });
    expect(await screen.findByRole('heading', { level: 1, name: 'Edit roadmap' })).toBeInTheDocument();
    await waitFor(() => expect(editorItems()).toHaveLength(200));
    await user.click(screen.getAllByRole('button', { name: 'Add item' })[0]);
    expect(screen.getByRole('alert')).toHaveTextContent('A roadmap can have up to 200 items.');
    expect(screen.queryByTestId('item-form-add')).toBeNull();
  });
});

describe('vi (M19-AC7)', () => {
  it('the editor on Q1 in Vietnamese has no English leaks', async () => {
    await withQ1('vi');
    await renderApp({ route: '/roadmaps/rq/edit', container: tc });
    expect(await screen.findByRole('heading', { level: 1, name: 'Sửa lộ trình' })).toBeInTheDocument();
    await waitFor(() => expect(editorItems()).toHaveLength(21));
    const picker = screen.getByLabelText('Mục tiêu liên kết (không bắt buộc)');
    await waitFor(() => expect(within(picker).getAllByRole('option').length).toBeGreaterThan(1));
    expect(screen.getByRole('button', { name: 'Chuyển Phase 1 · Linear Algebra lên' })).toHaveAttribute('aria-disabled', 'true');
    expect(editorItems()[1]).toHaveTextContent('03/11 – 09/11/2026');
    expect(scanVi()).toEqual([]);
    cleanup();
  });
});

describe('A-83 suggestion at the end of the calendar (M20-D1)', () => {
  it('the last item ends 9999-12-31 → Add item opens (no crash) with 9999-12-31 – 9999-12-31 instead of a 5-digit year', async () => {
    const user = userEvent.setup();
    tc = await createTestContainer({ locale: 'en', clock: () => FIXED_NOW_Q1 });
    const d = datasetQ1();
    d.items[20] = { ...d.items[20]!, plannedStart: '9999-12-25', plannedEnd: '9999-12-31' };
    await tc.container.db.goals.bulkPut(d.goals);
    await new DexieRoadmapRepository(tc.container.db, { clock: () => FIXED_NOW_Q1 }).putMany({ roadmaps: [d.roadmap], phases: d.phases, items: d.items, checkpoints: d.checkpoints });
    await renderApp({ route: '/roadmaps/rq/edit', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'Edit roadmap' });
    await user.click(screen.getAllByRole('button', { name: 'Add item' })[4]!);
    const form = within(await screen.findByTestId('item-form-add'));
    expect(form.getByLabelText(/^Planned start/)).toHaveValue('9999-12-31');
    expect(form.getByLabelText(/^Planned end/)).toHaveValue('9999-12-31');
  });
});
