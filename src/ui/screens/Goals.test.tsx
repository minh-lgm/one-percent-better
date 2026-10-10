import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import { datasetS1 } from '../../test/builders';
import { createTestContainer, type TestContainer } from '../../test/container';
import { renderApp, scanVi } from '../../test/render-with-locale';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

async function seeded(locale: 'en' | 'vi' = 'en') {
  tc = await createTestContainer({ locale });
  const { goals, entries } = datasetS1();
  await tc.container.db.goals.bulkPut(goals);
  await tc.container.db.entries.bulkPut(entries);
  return tc;
}

describe('Goals (M1-AC5, M1-AC9, M1-AC18)', () => {
  it('empty state', async () => {
    const app = await renderApp({ route: '/goals' });
    tc = app.tc;
    await screen.findByRole('heading', { level: 2, name: en.empty.goals });
    expect(screen.getByRole('link', { name: en.goals.new })).toHaveAttribute('href', '/goals/new');
  });

  it('groups goals by status with badges and date ranges', async () => {
    await seeded();
    await renderApp({ route: '/goals', container: tc });
    await screen.findByRole('heading', { level: 2, name: 'Active (3)' });
    expect(screen.getByRole('heading', { level: 2, name: 'Upcoming (1)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Ended (1)' })).toBeInTheDocument();
    const read = screen.getByRole('heading', { level: 3, name: 'Read' }).closest('li')!;
    expect(within(read).getByText(en.goal.status.active)).toBeInTheDocument();
    expect(within(read).getByText('30 min/day · 2026-10-01 – 2026-10-31')).toBeInTheDocument();
    expect(within(read).getByText('Be smarter')).toBeInTheDocument();
    const spanish = screen.getByRole('heading', { level: 3, name: 'Spanish' }).closest('li')!;
    expect(within(spanish).getByText('17 min/day (100 h total) · 2026-01-01 – 2026-12-31')).toBeInTheDocument();
    const marathon = screen.getByRole('heading', { level: 3, name: 'Marathon prep' }).closest('li')!;
    expect(within(marathon).getByText(en.goal.status.upcoming)).toBeInTheDocument();
    expect(within(marathon).getByText('Starts 2026-11-01')).toBeInTheDocument();
    const old = screen.getByRole('heading', { level: 3, name: 'Old course' }).closest('li')!;
    expect(within(old).getByText('Ended 2026-06-30')).toBeInTheDocument();
    expect(within(read).getByRole('link', { name: en.common.edit })).toHaveAttribute('href', '/goals/g1/edit');
  });

  it('delete asks for confirmation; Cancel keeps, Confirm removes goal and entries', async () => {
    const user = userEvent.setup();
    await seeded();
    await renderApp({ route: '/goals', container: tc });
    const read = (await screen.findByRole('heading', { level: 3, name: 'Read' })).closest('li')!;
    await user.click(within(read).getByRole('button', { name: en.common.delete }));
    const dialog = await screen.findByRole('dialog', { hidden: true });
    await waitFor(() => expect(dialog).toHaveAttribute('open'));
    expect(within(dialog).getByRole('heading', { name: 'Delete "Read"?' })).toBeInTheDocument();
    expect(within(dialog).getByText('This permanently deletes the goal and its 8 entries. This can\'t be undone.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: en.common.cancel })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: en.common.cancel }));
    await waitFor(() => expect(dialog).not.toHaveAttribute('open'));
    expect(screen.getByRole('heading', { level: 3, name: 'Read' })).toBeInTheDocument();

    await user.click(within(read).getByRole('button', { name: en.common.delete }));
    await waitFor(() => expect(dialog).toHaveAttribute('open'));
    await user.click(within(dialog).getByRole('button', { name: en.goal.delete.confirm }));
    await waitFor(() => expect(screen.queryByRole('heading', { level: 3, name: 'Read' })).toBeNull());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(en.toast.goalDeleted));
    expect(await tc!.container.db.goals.get('g1')).toBeUndefined();
    expect(await tc!.container.db.entries.where('goalId').equals('g1').count()).toBe(0);
    expect(await tc!.container.db.entries.count()).toBe(15);
    expect(screen.getByRole('heading', { level: 2, name: 'Active (2)' })).toBeInTheDocument();
  });

  it('deleting a goal with a running timer warns and discards the timer (M2-AC5)', async () => {
    const user = userEvent.setup();
    await seeded();
    await tc!.container.db.kv.put({ key: 'activeTimer', value: { goalId: 'g1', startedAt: '2026-10-09T03:00:00.000Z' } });
    await renderApp({ route: '/goals', container: tc });
    const read = (await screen.findByRole('heading', { level: 3, name: 'Read' })).closest('li')!;
    await user.click(within(read).getByRole('button', { name: en.common.delete }));
    const dialog = await screen.findByRole('dialog', { hidden: true });
    await waitFor(() => expect(dialog).toHaveAttribute('open'));
    expect(within(dialog).getByText(en.goal.delete.timerNote)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: en.goal.delete.confirm }));
    await waitFor(() => expect(screen.queryByRole('heading', { level: 3, name: 'Read' })).toBeNull());
    expect(await tc!.container.db.kv.get('activeTimer')).toBeUndefined();

    // A timer on another goal is not mentioned and survives.
    await tc!.container.db.kv.put({ key: 'activeTimer', value: { goalId: 'g3', startedAt: '2026-10-09T03:00:00.000Z' } });
    const guitar = screen.getByRole('heading', { level: 3, name: 'Guitar' }).closest('li')!;
    await user.click(within(guitar).getByRole('button', { name: en.common.delete }));
    await waitFor(() => expect(dialog).toHaveAttribute('open'));
    expect(within(dialog).queryByText(en.goal.delete.timerNote)).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: en.goal.delete.confirm }));
    await waitFor(() => expect(screen.queryByRole('heading', { level: 3, name: 'Guitar' })).toBeNull());
    expect((await tc!.container.db.kv.get('activeTimer'))?.value).toMatchObject({ goalId: 'g3' });
  });

  it('vi: delete dialog with a running timer has no English leaks', async () => {
    const user = userEvent.setup();
    await seeded('vi');
    await tc!.container.db.kv.put({ key: 'activeTimer', value: { goalId: 'g1', startedAt: '2026-10-09T03:00:00.000Z' } });
    await renderApp({ route: '/goals', container: tc });
    const read = (await screen.findByRole('heading', { level: 3, name: 'Read' })).closest('li')!;
    await user.click(within(read).getByRole('button', { name: vi.common.delete }));
    const dialog = await screen.findByRole('dialog', { hidden: true });
    await waitFor(() => expect(dialog).toHaveAttribute('open'));
    expect(within(dialog).getByText(vi.goal.delete.timerNote)).toBeInTheDocument();
    expect(scanVi()).toEqual([]);
  });

  it('delete body for a goal without entries uses the singular-free variant', async () => {
    const user = userEvent.setup();
    await seeded();
    await renderApp({ route: '/goals', container: tc });
    const marathon = (await screen.findByRole('heading', { level: 3, name: 'Marathon prep' })).closest('li')!;
    await user.click(within(marathon).getByRole('button', { name: en.common.delete }));
    const dialog = await screen.findByRole('dialog', { hidden: true });
    await waitFor(() => expect(dialog).toHaveAttribute('open'));
    expect(within(dialog).getByText(en.goal.delete.bodyNoEntries)).toBeInTheDocument();
  });

  it('vi: three groups, dates in dd/MM/yyyy, dialog, no English leaks', async () => {
    const user = userEvent.setup();
    await seeded('vi');
    await renderApp({ route: '/goals', container: tc });
    await screen.findByRole('heading', { level: 2, name: 'Đang chạy (3)' });
    expect(screen.getByRole('heading', { level: 2, name: 'Sắp tới (1)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Đã kết thúc (1)' })).toBeInTheDocument();
    expect(screen.getByText('30 phút/ngày · 01/10/2026 – 31/10/2026')).toBeInTheDocument();
    expect(screen.getByText('17 phút/ngày (tổng 100 giờ) · 01/01/2026 – 31/12/2026')).toBeInTheDocument();
    expect(screen.getByText('Bắt đầu 01/11/2026')).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Mục tiêu — 1% Better'));
    expect(scanVi()).toEqual([]);
    const read = screen.getByRole('heading', { level: 3, name: 'Read' }).closest('li')!;
    await user.click(within(read).getByRole('button', { name: vi.common.delete }));
    const dialog = await screen.findByRole('dialog', { hidden: true });
    await waitFor(() => expect(dialog).toHaveAttribute('open'));
    expect(within(dialog).getByRole('heading', { name: 'Xóa mục tiêu "Read"?' })).toBeInTheDocument();
    expect(within(dialog).getByText('Thao tác này xóa vĩnh viễn mục tiêu và 8 lần ghi của nó. Bạn không thể hoàn tác.')).toBeInTheDocument();
    expect(scanVi()).toEqual([]);
  });
});
