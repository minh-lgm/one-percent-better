import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import { buildGoal, datasetS1 } from '../../test/builders';
import { createTestContainer, type TestContainer } from '../../test/container';
import { renderApp, scanVi } from '../../test/render-with-locale';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

async function withReadGoal(locale: 'en' | 'vi' = 'en') {
  tc = await createTestContainer({ locale });
  await tc.container.db.goals.put(buildGoal({ id: 'g1', name: 'Read', targetMinutes: 30, startDate: '2026-10-01', endDate: '2026-10-31' }));
  return tc;
}

describe('Today (M1-AC2, AC5, AC6, AC7, AC18)', () => {
  it('empty state when there are no goals', async () => {
    const app = await renderApp({ route: '/today' });
    tc = app.tc;
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: en.empty.today.noGoals })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: en.empty.today.noGoalsAction })).toHaveAttribute('href', '/goals/new');
    expect(screen.getByText('Friday, October 9')).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Today — 1% Better'));
  });

  it('shows only active goals, with amount, progress and summary', async () => {
    tc = await createTestContainer();
    const { goals, entries } = datasetS1();
    await tc.container.db.goals.bulkPut(goals);
    await tc.container.db.entries.bulkPut(entries);
    await renderApp({ route: '/today', container: tc });
    const list = await screen.findByRole('list', { name: en.today.goalsLabel });
    const cards = within(list).getAllByRole('article');
    expect(cards.map((c) => within(c).getByRole('heading', { level: 2 }).textContent)).toEqual(['Read', 'Guitar', 'Spanish']);
    expect(within(cards[0]).getByText('0/30')).toBeInTheDocument();
    expect(within(cards[2]).getByText('0/17')).toBeInTheDocument();
    expect(within(cards[2]).getByText('17 min/day · 100 h total')).toBeInTheDocument();
    expect(screen.getByText('0 of 3 goals on target')).toBeInTheDocument();
    const bar = within(cards[0]).getByRole('progressbar', { name: 'Read today' });
    expect(bar).toHaveAttribute('aria-valuetext', '0 of 30 minutes');
    expect(screen.queryByTestId('plus-one')).toBeNull();
  });

  it('logs entries, shows +1% when the target is met, edit and delete update totals', async () => {
    const user = userEvent.setup();
    await withReadGoal();
    await renderApp({ route: '/today', container: tc });
    const card = await screen.findByRole('article', { name: 'Read' });
    const logBtn = within(card).getByRole('button', { name: en.goalCard.logTime });
    await user.click(logBtn);
    const form = within(card).getByRole('form', { name: 'Log time for Read' });
    expect(within(form).getByLabelText(/^Minutes/)).toHaveFocus();
    await user.type(within(form).getByLabelText(/^Minutes/), '20');
    await user.type(within(form).getByLabelText(/^Note/), 'Ch. 3');
    await user.click(within(form).getByRole('button', { name: en.entry.form.save }));
    await waitFor(() => expect(within(card).getByText('20/30')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(en.toast.entrySaved));
    expect(within(card).getByText('10 min to go')).toBeInTheDocument();
    expect(within(card).queryByTestId('plus-one')).toBeNull();
    expect(within(card).getByRole('button', { name: 'Edit entry: 20 min, Ch. 3' })).toBeInTheDocument();
    await waitFor(() => expect(logBtn).toHaveFocus());

    await user.click(logBtn);
    await user.type(within(card).getByLabelText(/^Minutes/), '10');
    await user.click(within(card).getByRole('button', { name: en.entry.form.save }));
    await waitFor(() => expect(within(card).getByText('30/30')).toBeInTheDocument());
    expect(within(card).getByTestId('plus-one')).toHaveTextContent('+1%');
    expect(within(card).getByText(en.goalCard.reached)).toBeInTheDocument();
    expect(screen.getByText('Goal on target — a little better than yesterday.')).toBeInTheDocument();

    // Edit 20 → 5
    await user.click(within(card).getByRole('button', { name: 'Edit entry: 20 min, Ch. 3' }));
    const editForm = within(card).getByRole('form', { name: 'Edit entry for Read' });
    const minutes = within(editForm).getByLabelText(/^Minutes/);
    expect(minutes).toHaveValue('20');
    await user.clear(minutes);
    await user.type(minutes, '5');
    await user.click(within(editForm).getByRole('button', { name: en.entry.form.saveChanges }));
    await waitFor(() => expect(within(card).getByText('15/30')).toBeInTheDocument());
    expect(within(card).queryByTestId('plus-one')).toBeNull();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(en.toast.entryUpdated));

    // Delete the 5-minute entry (confirm inline)
    await user.click(within(card).getByRole('button', { name: 'Delete entry: 5 min, Ch. 3' }));
    const confirm = within(card).getByRole('group', { name: 'Confirm delete: 5 min, Ch. 3' });
    expect(within(confirm).getByRole('button', { name: en.common.keep })).toHaveFocus();
    await user.click(within(confirm).getByRole('button', { name: en.common.delete }));
    await waitFor(() => expect(within(card).getByText('10/30')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(en.toast.entryDeleted));
    expect(await tc!.container.db.entries.filter((e) => e.deletedAt == null).count()).toBe(1); // v2: soft delete (ADR-20)
  });

  it('shows validation errors inline and keeps the form', async () => {
    const user = userEvent.setup();
    await withReadGoal();
    await renderApp({ route: '/today', container: tc });
    const card = await screen.findByRole('article', { name: 'Read' });
    await user.click(within(card).getByRole('button', { name: en.goalCard.logTime }));
    const minutes = within(card).getByLabelText(/^Minutes/);
    await user.type(minutes, '0');
    await user.click(within(card).getByRole('button', { name: en.entry.form.save }));
    await waitFor(() => expect(minutes).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.getByText(en.errors.ENTRY_MINUTES_INVALID)).toBeInTheDocument();
    expect(minutes).toHaveFocus();
    await user.clear(minutes);
    await user.type(minutes, '1400');
    await user.click(within(card).getByRole('button', { name: en.entry.form.save }));
    await waitFor(() => expect(within(card).getByText('1,400/30')).toBeInTheDocument());
    await user.click(within(card).getByRole('button', { name: en.goalCard.logTime }));
    await user.type(within(card).getByLabelText(/^Minutes/), '41');
    await user.click(within(card).getByRole('button', { name: en.entry.form.save }));
    expect(await screen.findByText('A goal can have at most 1,440 minutes in one day. You can add up to 40 more for this day.')).toBeInTheDocument();
    // Keep "delete" cancel path: Keep returns focus to the delete button
    await user.click(within(card).getByRole('button', { name: en.common.cancel }));
    const del = within(card).getByRole('button', { name: /^Delete entry/ });
    await user.click(del);
    await user.click(within(card).getByRole('button', { name: en.common.keep }));
    await waitFor(() => expect(within(card).getByRole('button', { name: /^Delete entry/ })).toHaveFocus());
  });

  it.each(['0x1E', '1e1', '0b11'])('entry minutes reject JavaScript numeric syntax %s (M1-D3)', async (raw) => {
    const user = userEvent.setup();
    await withReadGoal();
    await renderApp({ route: '/today', container: tc });
    const card = await screen.findByRole('article', { name: 'Read' });
    await user.click(within(card).getByRole('button', { name: en.goalCard.logTime }));
    const minutes = within(card).getByLabelText(/^Minutes/);
    await user.type(minutes, raw);
    await user.click(within(card).getByRole('button', { name: en.entry.form.save }));
    await waitFor(() => expect(minutes).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.getByText(en.errors.ENTRY_MINUTES_INVALID)).toBeInTheDocument();
    expect(await tc!.container.db.entries.count()).toBe(0);
  });

  it('plural summary uses _one/_other in en and _other in vi', async () => {
    tc = await createTestContainer();
    await tc.container.db.goals.put(buildGoal({ id: 'a', name: 'A' }));
    const app = await renderApp({ route: '/today', container: tc });
    await screen.findByRole('article', { name: 'A' });
    expect(screen.getByText('0 of 1 goal on target')).toBeInTheDocument();
    await tc.container.db.goals.bulkPut([buildGoal({ id: 'b', name: 'B' }), buildGoal({ id: 'c', name: 'C' })]);
    await waitFor(() => expect(screen.getByText('0 of 3 goals on target')).toBeInTheDocument());
    await tc.container.locale.change('vi');
    await waitFor(() => expect(screen.getByText('Đã đạt 0/3 mục tiêu')).toBeInTheDocument());
    await tc.container.db.goals.bulkDelete(['b', 'c']);
    await waitFor(() => expect(screen.getByText('Đã đạt 0/1 mục tiêu')).toBeInTheDocument());
    app.unmount();
  });

  it('vi: no English leaks in empty, not met, met, form open, minutes error and delete confirm', async () => {
    const user = userEvent.setup();
    const app = await renderApp({ route: '/today', locale: 'vi' });
    tc = app.tc;
    await screen.findByRole('heading', { level: 2, name: vi.empty.today.noGoals });
    const expectedDate = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(2026, 9, 9));
    expect(screen.getByText(expectedDate)).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Hôm nay — 1% Better'));
    expect(document.documentElement.lang).toBe('vi');
    expect(scanVi()).toEqual([]);

    await tc.container.db.goals.put(buildGoal({ id: 'g1', name: 'Read', targetMinutes: 30, startDate: '2026-10-01', endDate: '2026-10-31' }));
    const card = await screen.findByRole('article', { name: 'Read' });
    expect(within(card).getByText('Còn 30 phút')).toBeInTheDocument();
    expect(within(card).getByRole('progressbar', { name: 'Read hôm nay' })).toHaveAttribute('aria-valuetext', '0 trên 30 phút');
    expect(scanVi()).toEqual([]);

    await user.click(within(card).getByRole('button', { name: vi.goalCard.logTime }));
    expect(within(card).getByRole('form', { name: 'Ghi thời gian cho Read' })).toBeInTheDocument();
    expect(scanVi()).toEqual([]);
    await user.type(within(card).getByLabelText(/^Số phút/), '0');
    await user.click(within(card).getByRole('button', { name: vi.entry.form.save }));
    expect(await screen.findByText(vi.errors.ENTRY_MINUTES_INVALID)).toBeInTheDocument();
    expect(scanVi()).toEqual([]);

    const minutes = within(card).getByLabelText(/^Số phút/);
    await user.clear(minutes);
    await user.type(minutes, '30');
    await user.type(within(card).getByLabelText(/^Ghi chú/), 'Ch. 3');
    await user.click(within(card).getByRole('button', { name: vi.entry.form.save }));
    await waitFor(() => expect(within(card).getByTestId('plus-one')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(vi.toast.entrySaved));
    expect(within(card).getByText(vi.goalCard.reached)).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Sửa lần ghi: 30 phút, Ch. 3' })).toBeInTheDocument();
    expect(scanVi()).toEqual([]);

    await user.click(within(card).getByRole('button', { name: 'Xóa lần ghi: 30 phút, Ch. 3' }));
    expect(within(card).getByRole('group', { name: 'Xác nhận xóa: 30 phút, Ch. 3' })).toBeInTheDocument();
    expect(scanVi()).toEqual([]);
  });
});
