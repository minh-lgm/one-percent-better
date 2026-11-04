// @vitest-environment jsdom
// M20-AC2 / AC6 (component level): D7 TemplateDialog from the empty list, the list header and #/roadmaps/new — default
// date today + live preview, goal picker, language note, create → detail + toast, errors kept in the dialog, Esc/Cancel.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi as vitest } from 'vitest';
import { DexieRoadmapRepository } from '../../../data/dexie/roadmap-repo';
import { datasetQ1, FIXED_NOW_Q1 } from '../../../test/builders';
import { createTestContainer, type TestContainer } from '../../../test/container';
import { renderApp, scanVi } from '../../../test/render-with-locale';

let tc: TestContainer | undefined;

beforeEach(() => {
  vitest.setSystemTime(FIXED_NOW_Q1);
});
afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

/** S1 + gq + its entries, no roadmap (the M20 starting point, like e2e/fixtures/q1-goal-only-backup.json). */
async function goalOnly(locale: 'en' | 'vi') {
  tc = await createTestContainer({ locale, clock: () => FIXED_NOW_Q1 });
  const d = datasetQ1();
  await tc.container.db.goals.bulkPut(d.goals);
  await tc.container.db.entries.bulkPut(d.entries);
  return tc;
}

const dialog = () => screen.getByTestId('template-dialog');

describe('TemplateDialog (D7, M20-AC2)', () => {
  it('vi, empty list: default date 04/11/2026 with the preview, focus on the date; 27/10/2026 + "QPT study" → Create → detail 0/21, 5 phases, W20 09/03 – 15/03/2027, 125 days, toast; no English', async () => {
    const user = userEvent.setup();
    await goalOnly('vi');
    const app = await renderApp({ route: '/roadmaps', container: tc });
    const empty = await screen.findByTestId('roadmaps-empty');
    await user.click(within(empty).getByRole('button', { name: 'Tạo từ mẫu QPT 21 tuần' }));
    const d = within(dialog());
    expect(d.getByRole('heading', { level: 2, name: 'Tạo từ mẫu QPT 21 tuần' })).toBeInTheDocument();
    const start = d.getByLabelText(/^Ngày bắt đầu/);
    expect(start).toHaveValue('2026-11-04');
    await waitFor(() => expect(start).toHaveFocus());
    expect(start).toHaveAccessibleDescription('Tuần 1: 04/11/2026. Tuần 20 (thi QPT): 17/03/2027. Tuần cuối kết thúc ngày 30/03/2027.');
    fireEvent.change(start, { target: { value: '2026-10-27' } });
    expect(start).toHaveAccessibleDescription('Tuần 1: 27/10/2026. Tuần 20 (thi QPT): 09/03/2027. Tuần cuối kết thúc ngày 22/03/2027.');
    const picker = d.getByLabelText('Mục tiêu liên kết (không bắt buộc)');
    await waitFor(() => expect(within(picker).getByRole('option', { name: 'QPT study' })).toBeInTheDocument());
    await user.selectOptions(picker, 'gq');
    expect(d.getByText('Tạo bằng Tiếng Việt. Đổi ngôn ngữ app sau này sẽ không dịch lại nội dung này.')).toBeInTheDocument();
    expect(scanVi(dialog())).toEqual([]);
    await user.click(d.getByRole('button', { name: 'Tạo lộ trình' }));
    await waitFor(() => expect(app.router.state.location.pathname).toMatch(/^\/roadmaps\/[^/]+$/));
    expect(screen.queryByTestId('template-dialog')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('Đã tạo lộ trình từ mẫu QPT'));
    expect(await screen.findByRole('heading', { level: 1, name: 'QPT 21 tuần' })).toBeInTheDocument();
    expect(screen.getByTestId('done-value')).toHaveTextContent('0/21');
    expect(screen.getAllByTestId('phase')).toHaveLength(5);
    expect(screen.getByTestId('milestone-value')).toHaveTextContent('125');
    // no actual dates yet: W1 gets 10-27 … 11-01 (270), W2 11-03 / 11-04 (75) → 5,8 giờ of 16 giờ
    expect(screen.getByTestId('hours-value')).toHaveTextContent('5,8 giờ');
    const w20 = screen.getAllByTestId('roadmap-item')[19]!;
    expect(w20).toHaveTextContent('Thi QPT chính thức');
    expect(w20).toHaveTextContent('09/03 – 15/03/2027');
    const id = app.router.state.location.pathname.split('/')[2]!;
    expect((await tc!.container.db.roadmaps.get(id))?.goalId).toBe('gq');
  });

  it('en, from the list header and from #/roadmaps/new: no goal → hours "—"; Esc and Cancel close it and give focus back to the button', async () => {
    const user = userEvent.setup();
    await goalOnly('en');
    const app = await renderApp({ route: '/roadmaps/new', container: tc });
    const banner = await screen.findByTestId('new-template-banner');
    expect(banner).toHaveTextContent('Prefer a ready-made plan?');
    const open = within(banner).getByRole('button', { name: 'Create from QPT 21-week template' });
    await waitFor(() => expect(open).toBeEnabled());
    await user.click(open);
    expect(within(dialog()).getByText("Created in English. Changing the app language later won't translate it.")).toBeInTheDocument();
    fireEvent(dialog(), new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(screen.queryByTestId('template-dialog')).toBeNull());
    await waitFor(() => expect(open).toHaveFocus());
    await user.click(open);
    await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByTestId('template-dialog')).toBeNull());
    await user.click(open);
    await user.click(within(dialog()).getByRole('button', { name: 'Create roadmap' }));
    await waitFor(() => expect(app.router.state.location.pathname).toMatch(/^\/roadmaps\/[^/]+$/));
    expect(await screen.findByRole('heading', { level: 1, name: 'QPT 21 weeks' })).toBeInTheDocument();
    expect(screen.getByTestId('hours-value')).toHaveTextContent('—');
    expect(screen.getByTestId('toast')).toHaveTextContent('Roadmap created from the QPT template');
    // the list now has a row and the header carries both create buttons
    await app.router.navigate('/roadmaps');
    expect(await screen.findByTestId('roadmap-row')).toHaveTextContent('QPT 21 weeks');
    expect(screen.getByTestId('roadmap-create-template')).toHaveTextContent('Create from QPT 21-week template');
  });

  it('errors stay in the dialog with what was typed: goal taken meanwhile → ROADMAP_GOAL_ALREADY_LINKED under the picker; empty date → format under the date (no preview); 20 roadmaps → limit Alert', async () => {
    const user = userEvent.setup();
    await goalOnly('en');
    const app = await renderApp({ route: '/roadmaps', container: tc });
    await user.click(await screen.findByRole('button', { name: 'Create from QPT 21-week template' }));
    const d = within(dialog());
    const picker = d.getByLabelText('Linked goal (optional)');
    await waitFor(() => expect(within(picker).getByRole('option', { name: 'QPT study' })).toBeInTheDocument());
    await user.selectOptions(picker, 'gq');
    // another device / tab links gq first (the picker read the goals once)
    const d1 = datasetQ1();
    await new DexieRoadmapRepository(tc!.container.db, { clock: () => FIXED_NOW_Q1 }).putMany({ roadmaps: [{ ...d1.roadmap, id: 'other', title: 'Spanish B1' }] });
    await user.click(d.getByRole('button', { name: 'Create roadmap' }));
    expect(await d.findByText('This goal is already linked to "Spanish B1". Choose another goal, or unlink it there first.')).toBeInTheDocument();
    expect(picker).toHaveAttribute('aria-invalid', 'true');
    // M20-D2: focus moves once the fields are enabled again (after the busy state) — wait for it.
    await waitFor(() => expect(picker).toHaveFocus());
    expect(app.router.state.location.pathname).toBe('/roadmaps');
    // empty date
    await user.selectOptions(picker, '');
    const start = d.getByLabelText(/^Start date/);
    fireEvent.change(start, { target: { value: '' } });
    expect(start).not.toHaveAccessibleDescription(/Week 1/);
    await user.click(d.getByRole('button', { name: 'Create roadmap' }));
    expect(await d.findByText('Enter a valid date.')).toBeInTheDocument();
    expect(start).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(start).toHaveFocus());
    expect(await tc!.container.db.roadmaps.count()).toBe(1);
    // the limit
    const repo = new DexieRoadmapRepository(tc!.container.db, { clock: () => FIXED_NOW_Q1 });
    await repo.putMany({ roadmaps: Array.from({ length: 19 }, (_, i) => ({ ...d1.roadmap, id: `r${i}`, goalId: null, title: `R${i}` })) });
    fireEvent.change(start, { target: { value: '2026-10-27' } });
    await user.click(d.getByRole('button', { name: 'Create roadmap' }));
    expect(await d.findByRole('alert')).toHaveTextContent('You can have up to 20 roadmaps. Delete one to add another.');
    expect(start).toHaveValue('2026-10-27');
    expect(await tc!.container.db.roadmapItems.count()).toBe(0);
  });

  it('M20-D1: a start whose 21 weeks pass 9999-12-31 → no preview (never NaN), "Enter a valid date." under the field at once; Create only focuses the field and writes nothing; 9999-08-07 still previews', async () => {
    const user = userEvent.setup();
    await goalOnly('en');
    const app = await renderApp({ route: '/roadmaps', container: tc });
    await user.click(await screen.findByRole('button', { name: 'Create from QPT 21-week template' }));
    const d = within(dialog());
    const start = d.getByLabelText(/^Start date/);
    fireEvent.change(start, { target: { value: '9999-12-31' } });
    expect(dialog()).not.toHaveTextContent('NaN');
    expect(start).not.toHaveAccessibleDescription(/Week 1/);
    expect(d.getByText('Enter a valid date.')).toBeInTheDocument();
    expect(start).toHaveAttribute('aria-invalid', 'true');
    await user.click(d.getByRole('button', { name: 'Create roadmap' }));
    await waitFor(() => expect(start).toHaveFocus());
    expect(screen.getByTestId('template-dialog')).toBeInTheDocument();
    expect(app.router.state.location.pathname).toBe('/roadmaps');
    expect(await tc!.container.db.roadmaps.count()).toBe(0);
    expect(await tc!.container.db.roadmapItems.count()).toBe(0);
    fireEvent.change(start, { target: { value: '9999-08-07' } });
    expect(start).toHaveAccessibleDescription('Week 1: 9999-08-07. Week 20 (QPT exam): 9999-12-18. The last week ends 9999-12-31.');
    expect(d.queryByText('Enter a valid date.')).toBeNull();
  });
});
