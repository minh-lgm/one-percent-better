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

async function withS1(locale: 'en' | 'vi' = 'en') {
  tc = await createTestContainer({ locale });
  const { goals, entries } = datasetS1();
  await tc.container.db.goals.bulkPut(goals);
  await tc.container.db.entries.bulkPut(entries);
  return tc;
}

const groupNames = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
const row = (name: string) => screen.getByRole('link', { name }).closest('li')!;

describe('Goals — Archive / Restore and the Archived group (M5-AC4, M5-AC13)', () => {
  it('Archive "Spanish" moves it to Archived (3), Restore brings it back; toasts; Today hides the archived goal', async () => {
    const user = userEvent.setup();
    await withS1();
    const app = await renderApp({ route: '/goals', container: tc });
    await screen.findByRole('link', { name: 'Read' });
    expect(groupNames()).toEqual(['Active (3)', 'Upcoming (1)', 'Ended (1)']);
    expect(screen.getAllByRole('button', { name: en.goals.archive })).toHaveLength(5);
    expect(screen.queryByRole('button', { name: en.goals.restore })).toBeNull();

    await user.click(within(row('Spanish')).getByRole('button', { name: en.goals.archive }));
    await waitFor(() => expect(groupNames()).toEqual(['Active (2)', 'Upcoming (1)', 'Ended (1)', 'Archived (1)']));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(en.toast.goalArchived));
    const archivedSection = screen.getByRole('heading', { level: 2, name: 'Archived (1)' }).closest('section')!;
    expect(within(archivedSection).getByRole('link', { name: 'Spanish' })).toBeInTheDocument();
    expect(within(archivedSection).getByText(en.goal.status.archived)).toBeInTheDocument();
    expect(within(archivedSection).getByRole('button', { name: en.goals.restore })).toBeInTheDocument();
    expect(within(archivedSection).queryByRole('button', { name: en.goals.archive })).toBeNull();
    expect((await tc!.container.db.goals.get('g3'))?.archived).toBe(true);
    // Data is untouched.
    expect(await tc!.container.db.entries.where('goalId').equals('g3').count()).toBe(1);

    app.router.navigate('/today');
    const list = await screen.findByRole('list', { name: en.today.goalsLabel });
    expect(within(list).getAllByRole('article').map((c) => within(c).getByRole('heading', { level: 2 }).textContent)).toEqual(['Read', 'Guitar']);
    app.router.navigate('/goals');
    await screen.findByRole('button', { name: en.goals.restore });

    await user.click(screen.getByRole('button', { name: en.goals.restore }));
    await waitFor(() => expect(groupNames()).toEqual(['Active (3)', 'Upcoming (1)', 'Ended (1)']));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(en.toast.goalRestored));
    expect((await tc!.container.db.goals.get('g3'))?.archived).toBe(false);
  });

  it('archived goals are sorted by updatedAt descending (most recently archived first), ties by id', async () => {
    const user = userEvent.setup();
    await withS1();
    await renderApp({ route: '/goals', container: tc });
    await screen.findByRole('link', { name: 'Read' });
    await user.click(within(row('Read')).getByRole('button', { name: en.goals.archive }));
    await screen.findByRole('heading', { level: 2, name: 'Archived (1)' });
    await tc!.container.db.goals.update('g5', { archived: true, updatedAt: '2026-10-09T01:00:00.000Z' });
    await screen.findByRole('heading', { level: 2, name: 'Archived (2)' });
    const section = screen.getByRole('heading', { level: 2, name: 'Archived (2)' }).closest('section')!;
    await waitFor(() => expect(within(section).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Read', 'Old course']));
  });

  it('archiving the goal whose timer runs shows the GOAL_TIMER_RUNNING alert in that row and changes nothing', async () => {
    const user = userEvent.setup();
    await withS1();
    await tc!.container.db.kv.put({ key: 'activeTimer', value: { goalId: 'g1', startedAt: '2026-10-09T02:00:00.000Z' } });
    await renderApp({ route: '/goals', container: tc });
    await screen.findByRole('link', { name: 'Read' });
    await user.click(within(row('Read')).getByRole('button', { name: en.goals.archive }));
    expect(await within(row('Read')).findByRole('alert')).toHaveTextContent(en.errors.GOAL_TIMER_RUNNING);
    expect(groupNames()).toEqual(['Active (3)', 'Upcoming (1)', 'Ended (1)']);
    expect((await tc!.container.db.goals.get('g1'))?.archived).toBe(false);
    // Another goal can still be archived; the alert disappears.
    await user.click(within(row('Guitar')).getByRole('button', { name: en.goals.archive }));
    await screen.findByRole('heading', { level: 2, name: 'Archived (1)' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('D2: the delete dialog of a goal with a running timer has the timer note in its accessible description; without a timer it does not (M2-P2)', async () => {
    const user = userEvent.setup();
    await withS1();
    await tc!.container.db.kv.put({ key: 'activeTimer', value: { goalId: 'g1', startedAt: '2026-10-09T02:00:00.000Z' } });
    await renderApp({ route: '/goals', container: tc });
    await screen.findByRole('link', { name: 'Read' });
    await user.click(within(row('Read')).getByRole('button', { name: en.common.delete }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleDescription(`This permanently deletes the goal and its 8 entries. This can't be undone. ${en.goal.delete.timerNote}`);
    await user.click(within(dialog).getByRole('button', { name: en.common.cancel }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(within(row('Guitar')).getByRole('button', { name: en.common.delete }));
    const dialog2 = await screen.findByRole('dialog');
    expect(dialog2).toHaveAccessibleDescription("This permanently deletes the goal and its 13 entries. This can't be undone.");
    expect(dialog2).not.toHaveAccessibleDescription(new RegExp(en.goal.delete.timerNote));
  });

  it('goals subscription error → ErrorState with Retry', async () => {
    const user = userEvent.setup();
    await withS1();
    const real = tc!.container.goalService.watchAll.bind(tc!.container.goalService);
    let fail = true;
    tc!.container.goalService.watchAll = () => (fail ? { subscribe: (_n, onError) => (onError?.(new Error('boom')), () => {}) } : real());
    await renderApp({ route: '/goals', container: tc });
    const error = await screen.findByTestId('error-state');
    expect(error).toHaveTextContent(en.errors.loadViewTitle);
    fail = false;
    await user.click(within(error).getByRole('button', { name: en.common.retry }));
    expect(await screen.findByRole('link', { name: 'Read' })).toBeInTheDocument();
  });

  it('vi: Archived group, Restore button, archive toast, GOAL_TIMER_RUNNING alert and D2 description without English leaks', async () => {
    const user = userEvent.setup();
    await withS1('vi');
    await tc!.container.db.goals.update('g5', { archived: true });
    await tc!.container.db.kv.put({ key: 'activeTimer', value: { goalId: 'g1', startedAt: '2026-10-09T02:00:00.000Z' } });
    await renderApp({ route: '/goals', container: tc });
    await screen.findByRole('link', { name: 'Read' });
    expect(groupNames()).toEqual(['Đang chạy (3)', 'Sắp tới (1)', 'Đã lưu trữ (1)']);
    expect(screen.getByRole('button', { name: vi.goals.restore })).toBeInTheDocument();
    expect(screen.getByText(vi.goal.status.archived)).toBeInTheDocument();
    expect(scanVi()).toEqual([]);
    await user.click(within(row('Read')).getByRole('button', { name: vi.goals.archive }));
    expect(await within(row('Read')).findByRole('alert')).toHaveTextContent(vi.errors.GOAL_TIMER_RUNNING);
    expect(scanVi()).toEqual([]);
    await user.click(within(row('Guitar')).getByRole('button', { name: vi.goals.archive }));
    await screen.findByRole('heading', { level: 2, name: 'Đã lưu trữ (2)' });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(vi.toast.goalArchived));
    expect(scanVi()).toEqual([]);
    await user.click(within(row('Read')).getByRole('button', { name: vi.common.delete }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleDescription(new RegExp(vi.goal.delete.timerNote));
    expect(scanVi()).toEqual([]);
  });
});
