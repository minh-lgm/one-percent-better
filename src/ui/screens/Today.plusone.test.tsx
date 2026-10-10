import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi as vitest } from 'vitest';
import type { Subscribable } from '../../data/repositories';
import { StorageError, type ActiveTimer } from '../../domain/types';
import { fail } from '../../domain/types';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import { buildEntry, buildGoal } from '../../test/builders';
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

async function log(user: ReturnType<typeof userEvent.setup>, minutes: number, note = '') {
  const card = screen.getByRole('article', { name: 'Read' });
  await user.click(within(card).getByRole('button', { name: en.goalCard.logTime }));
  await user.type(within(card).getByLabelText(/^Minutes/), String(minutes));
  if (note) await user.type(within(card).getByLabelText(/^Note/), note);
  await user.click(within(card).getByRole('button', { name: en.entry.form.save }));
}

const live = () => screen.getByTestId('plus-one-live');
const amount = (text: string) => waitFor(() => expect(within(screen.getByRole('article', { name: 'Read' })).getByText(text)).toBeInTheDocument());

describe('"+1%" feedback once per goal and day (M5-AC3, FR-29)', () => {
  it('fires once when an entry reaches the target; not again for extra minutes, after a reload, or after delete + re-add; fires again the next day', async () => {
    const user = userEvent.setup();
    await withReadGoal();
    const app = await renderApp({ route: '/today', container: tc });
    await screen.findByRole('article', { name: 'Read' });
    expect(live()).toHaveAttribute('data-count', '0');

    await log(user, 20);
    await amount('20/30');
    expect(live()).toHaveAttribute('data-count', '0');
    expect(live()).toHaveTextContent('');

    await log(user, 10);
    await amount('30/30');
    await waitFor(() => expect(live()).toHaveAttribute('data-count', '1'));
    expect(live()).toHaveTextContent('+1% for Read today.');
    expect(screen.getByTestId('plus-one')).toHaveAttribute('data-animate', 'true');
    expect(screen.getByTestId('plus-one')).toHaveClass('entering');
    await waitFor(async () => expect((await tc!.container.settingsService.get()).plusOneShown).toEqual({ g1: '2026-10-09' }));

    await log(user, 5);
    await amount('35/30');
    expect(live()).toHaveAttribute('data-count', '1');

    // Reload: nothing is announced again.
    app.unmount();
    await renderApp({ route: '/today', container: tc });
    await amount('35/30');
    expect(screen.getByTestId('plus-one')).toBeInTheDocument();
    expect(live()).toHaveAttribute('data-count', '0');
    expect(live()).toHaveTextContent('');
    expect(screen.getByTestId('plus-one')).not.toHaveClass('entering');

    // Delete enough to drop below the target, then log again: already shown today.
    const entries = await tc!.container.db.entries.where('goalId').equals('g1').toArray();
    await tc!.container.db.entries.delete(entries.find((e) => e.minutes === 10)!.id);
    await tc!.container.db.entries.delete(entries.find((e) => e.minutes === 5)!.id);
    await amount('20/30');
    await waitFor(() => expect(screen.queryByTestId('plus-one')).toBeNull());
    await log(user, 10);
    await amount('30/30');
    expect(screen.getByTestId('plus-one')).toBeInTheDocument();
    expect(live()).toHaveAttribute('data-count', '0');
  });

  it('the next day the feedback fires again; vi announces the vi string with the goal name untouched', async () => {
    const user = userEvent.setup();
    await withReadGoal('vi');
    await tc!.container.settingsService.claimPlusOne('g1', '2026-10-09');
    await tc!.container.db.entries.put(buildEntry({ id: 'yesterday', goalId: 'g1', date: '2026-10-09', minutes: 30 }));
    vitest.setSystemTime(new Date('2026-10-10T09:00:00+07:00'));
    await renderApp({ route: '/today', container: tc });
    await screen.findByRole('article', { name: 'Read' });
    const card = screen.getByRole('article', { name: 'Read' });
    await user.click(within(card).getByRole('button', { name: vi.goalCard.logTime }));
    await user.type(within(card).getByLabelText(/^Số phút/), '30');
    await user.click(within(card).getByRole('button', { name: vi.entry.form.save }));
    await waitFor(() => expect(live()).toHaveAttribute('data-count', '1'));
    expect(live()).toHaveTextContent('+1% cho Read hôm nay.');
    expect(scanVi()).toEqual([]);
    expect((await tc!.container.settingsService.get()).plusOneShown).toEqual({ g1: '2026-10-10' });
  });

  it('a timer save that reaches the target also fires the feedback', async () => {
    const user = userEvent.setup();
    await withReadGoal();
    await renderApp({ route: '/today', container: tc });
    const card = await screen.findByRole('article', { name: 'Read' });
    await user.click(within(card).getByRole('button', { name: en.goalCard.startTimer }));
    await screen.findByTestId('timer-card');
    act(() => {
      vitest.setSystemTime(new Date('2026-10-09T10:30:00+07:00'));
    });
    await waitFor(() => expect(screen.getByRole('timer')).toHaveTextContent('00:30:00'), { timeout: 2500 });
    await user.click(screen.getByRole('button', { name: /^Stop timer for Read/ }));
    const dialog = await screen.findByTestId('stop-dialog');
    await waitFor(() => expect(within(dialog).getByLabelText(/^Minutes/)).toHaveValue('30'));
    await user.click(within(dialog).getByRole('button', { name: en.entry.form.save }));
    await amount('30/30');
    await waitFor(() => expect(live()).toHaveAttribute('data-count', '1'));
  });
});

describe('Today — M5-AC13 (entry order, pendingTimer), M3-D4, M5-AC6', () => {
  it('two entries with the same createdAt are shown in id order (e1 before e2) whatever the insertion order', async () => {
    await withReadGoal();
    const stamp = '2026-10-09T02:00:00.000Z';
    await tc!.container.db.entries.bulkPut([buildEntry({ id: 'e2', goalId: 'g1', minutes: 5, note: 'second', createdAt: stamp }), buildEntry({ id: 'e1', goalId: 'g1', minutes: 7, note: 'first', createdAt: stamp })]);
    await renderApp({ route: '/today', container: tc });
    const card = await screen.findByRole('article', { name: 'Read' });
    await waitFor(() => expect(within(card).getAllByRole('listitem')).toHaveLength(2));
    expect(within(card).getAllByRole('listitem').map((li) => li.textContent)).toEqual([expect.stringContaining('first'), expect.stringContaining('second')]);
  });

  it('pendingTimer is cleared on every emission of the timer query, even a repeated `undefined` (M2-P2)', async () => {
    const user = userEvent.setup();
    await withReadGoal();
    await tc!.container.db.goals.put(buildGoal({ id: 'g2', name: 'Guitar', targetMinutes: 20, startDate: '2026-10-01', endDate: '2026-10-31', createdAt: '2026-10-02T00:00:00.000Z' }));
    const listeners: Array<(v: ActiveTimer | undefined) => void> = [];
    const fake: Subscribable<ActiveTimer | undefined> = {
      subscribe(onNext) {
        listeners.push(onNext);
        onNext(undefined);
        return () => {};
      },
    };
    tc!.container.timerService.watch = () => fake;
    await renderApp({ route: '/today', container: tc });
    const read = await screen.findByRole('article', { name: 'Read' });
    await user.click(within(read).getByRole('button', { name: en.goalCard.startTimer }));
    // The optimistic state shows the card right away (the fake query never reports the timer).
    expect(await screen.findByTestId('timer-card')).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: 'Guitar' })).getByRole('button', { name: en.goalCard.startTimer })).toHaveAttribute('aria-disabled', 'true');
    // Another tab removed the timer: the live query emits `undefined` again (same value as before).
    act(() => {
      for (const l of listeners) l(undefined);
    });
    await waitFor(() => expect(screen.queryByTestId('timer-card')).toBeNull());
    expect(within(read).getByRole('button', { name: en.goalCard.startTimer })).not.toHaveAttribute('aria-disabled');
    expect(within(screen.getByRole('article', { name: 'Guitar' })).getByRole('button', { name: en.goalCard.startTimer })).not.toHaveAttribute('aria-disabled');
  });

  it('M3-D4: losing the Save race (TIMER_NOT_RUNNING) closes the dialog and says why; the summary keeps the goal name', async () => {
    const user = userEvent.setup();
    await withReadGoal();
    await renderApp({ route: '/today', container: tc });
    const card = await screen.findByRole('article', { name: 'Read' });
    await user.click(within(card).getByRole('button', { name: en.goalCard.startTimer }));
    await screen.findByTestId('timer-card');
    await user.click(screen.getByRole('button', { name: /^Stop timer for Read/ }));
    const dialog = await screen.findByTestId('stop-dialog');
    expect(within(dialog).getByText(/^Read · tracked/)).toBeInTheDocument();
    // Meanwhile another tab saved the timer.
    await tc!.container.db.kv.delete('activeTimer');
    await waitFor(() => expect(screen.queryByTestId('timer-card')).toBeNull());
    expect(within(dialog).getByText(/^Read · tracked/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: en.entry.form.save }));
    await waitFor(() => expect(screen.queryByTestId('stop-dialog')).toBeNull());
    expect(await screen.findByRole('alert')).toHaveTextContent(en.errors.TIMER_NOT_RUNNING);
    expect(await tc!.container.db.entries.count()).toBe(0);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());
  });

  it('M3-D4: a service-level TIMER_NOT_RUNNING (fake) closes the dialog too; field errors keep it open', async () => {
    const user = userEvent.setup();
    await withReadGoal();
    await renderApp({ route: '/today', container: tc });
    const card = await screen.findByRole('article', { name: 'Read' });
    await user.click(within(card).getByRole('button', { name: en.goalCard.startTimer }));
    await screen.findByTestId('timer-card');
    await user.click(screen.getByRole('button', { name: /^Stop timer for Read/ }));
    const dialog = await screen.findByTestId('stop-dialog');
    const minutes = within(dialog).getByLabelText(/^Minutes/);
    await user.clear(minutes);
    await user.type(minutes, '0');
    await user.click(within(dialog).getByRole('button', { name: en.entry.form.save }));
    expect(await within(dialog).findByText(en.errors.ENTRY_MINUTES_INVALID)).toBeInTheDocument();
    tc!.container.timerService.save = async () => fail({ code: 'TIMER_NOT_RUNNING', message: 'lost the race' });
    await user.clear(minutes);
    await user.type(minutes, '10');
    await user.click(within(dialog).getByRole('button', { name: en.entry.form.save }));
    await waitFor(() => expect(screen.queryByTestId('stop-dialog')).toBeNull());
    expect(await screen.findByRole('alert')).toHaveTextContent(en.errors.TIMER_NOT_RUNNING);
    // The alert goes away with the next timer action (the fake save left the timer running: Stop again).
    await user.click(screen.getByRole('button', { name: /^Stop timer for Read/ }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(await screen.findByTestId('stop-dialog')).toBeInTheDocument();
    expect(card).toBeInTheDocument();
  });

  it('M5-AC6: a StorageError while saving an entry shows the inline message and keeps the typed values', async () => {
    const user = userEvent.setup();
    await withReadGoal();
    tc!.container.entryService.add = async () => {
      throw new StorageError('quota');
    };
    await renderApp({ route: '/today', container: tc });
    const card = await screen.findByRole('article', { name: 'Read' });
    await log(user, 20, 'Ch. 3');
    expect(await within(card).findByRole('alert')).toHaveTextContent(en.errors.WRITE_FAILED);
    expect(within(card).getByLabelText(/^Minutes/)).toHaveValue('20');
    expect(within(card).getByLabelText(/^Note/)).toHaveValue('Ch. 3');
    expect(within(card).getByText('0/30')).toBeInTheDocument();
  });

  it('a subscription error shows the ErrorState with Retry (en + vi scan)', async () => {
    const user = userEvent.setup();
    await withReadGoal('vi');
    const real = tc!.container.goalService.watchAll.bind(tc!.container.goalService);
    let broken = true;
    tc!.container.goalService.watchAll = () => (broken ? { subscribe: (_n, onError) => (onError?.(new Error('boom')), () => {}) } : real());
    await renderApp({ route: '/today', container: tc });
    const error = await screen.findByTestId('error-state');
    expect(error).toHaveTextContent(vi.errors.loadViewTitle);
    expect(scanVi()).toEqual([]);
    broken = false;
    await user.click(within(error).getByRole('button', { name: vi.common.retry }));
    expect(await screen.findByRole('article', { name: 'Read' })).toBeInTheDocument();
  });
});
