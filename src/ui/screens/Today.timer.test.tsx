import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi as vitest } from 'vitest';
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

const T0 = new Date('2026-10-09T10:00:00+07:00');
const at = (hhmmss: string, date = '2026-10-09') => new Date(`${date}T${hhmmss}+07:00`);
/** The TimerCard re-reads the (faked) Date once per real second: allow a little more than that. */
const TICK = { timeout: 2500 };

async function seededS1(locale: 'en' | 'vi' = 'en') {
  tc = await createTestContainer({ locale });
  const { goals, entries } = datasetS1();
  await tc.container.db.goals.bulkPut(goals);
  await tc.container.db.entries.bulkPut(entries.filter((e) => e.date !== '2026-10-09'));
  return tc;
}

/** Move the faked clock (only `Date` is faked; intervals and rAF run for real). */
function setClock(d: Date) {
  act(() => {
    vitest.setSystemTime(d);
  });
}

describe('Today timer (M2-AC1, AC2, AC3, AC4, AC5)', () => {
  it('Start shows the pinned TimerCard at 00:00:00, disables Start on other goals and ticks every second', async () => {
    const u = userEvent.setup();
    await seededS1();
    await renderApp({ route: '/today', container: tc });
    const read = await screen.findByRole('article', { name: 'Read' });
    await u.click(within(read).getByRole('button', { name: en.goalCard.startTimer }));

    const card = await screen.findByTestId('timer-card');
    expect(within(card).getByRole('heading', { level: 2, name: 'Timer running · Read' })).toBeInTheDocument();
    expect(within(card).getByText(en.timer.badge)).toBeInTheDocument();
    const clock = within(card).getByRole('timer', { name: en.timer.elapsedLabel });
    expect(clock).toHaveTextContent('00:00:00');
    expect(within(card).getByText('Started at 10:00')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Stop timer for Read, running 00:00:00' })).toBeInTheDocument();
    expect(await tc!.container.db.kv.get('activeTimer')).toEqual({ key: 'activeTimer', value: { goalId: 'g1', startedAt: T0.toISOString() } });

    // The running goal shows a badge instead of Start; others are aria-disabled with a reason.
    expect(within(read).getByText(en.goalCard.timerRunningBadge)).toBeInTheDocument();
    expect(within(read).queryByRole('button', { name: en.goalCard.startTimer })).toBeNull();
    const guitar = screen.getByRole('article', { name: 'Guitar' });
    const guitarStart = within(guitar).getByRole('button', { name: en.goalCard.startTimer });
    expect(guitarStart).toHaveAttribute('aria-disabled', 'true');
    expect(guitarStart).toHaveAccessibleDescription(en.goalCard.timerDisabled);
    await u.click(guitarStart);
    expect((await tc!.container.db.kv.get('activeTimer'))?.value).toMatchObject({ goalId: 'g1' });

    setClock(at('10:01:05'));
    await waitFor(() => expect(clock).toHaveTextContent('00:01:05'), TICK);
    expect(within(card).getByRole('button', { name: 'Stop timer for Read, running 00:01:05' })).toBeInTheDocument();
  });

  it('Stop opens D1 pre-filled with the rounded minutes; Save creates a timer entry on the start day', async () => {
    const u = userEvent.setup();
    await seededS1();
    await renderApp({ route: '/today', container: tc });
    const read = await screen.findByRole('article', { name: 'Read' });
    await u.click(within(read).getByRole('button', { name: en.goalCard.startTimer }));
    const card = await screen.findByTestId('timer-card');
    setClock(at('10:25:31'));
    await waitFor(() => expect(within(card).getByRole('timer')).toHaveTextContent('00:25:31'), TICK);
    await u.click(screen.getByRole('button', { name: /^Stop timer for Read/ }));

    const dialog = await screen.findByTestId('stop-dialog');
    await waitFor(() => expect(dialog).toHaveAttribute('open'));
    expect(within(dialog).getByRole('heading', { level: 2, name: en.timer.dialogTitle })).toBeInTheDocument();
    expect(within(dialog).getByText('Read · tracked 00:25:31')).toBeInTheDocument();
    const minutes = within(dialog).getByLabelText(/^Minutes/);
    await waitFor(() => expect(minutes).toHaveValue('26'));
    await waitFor(() => expect(minutes).toHaveFocus());
    expect(within(dialog).getByText('Rounded from 25 min 31 s. You can change it.')).toBeInTheDocument();
    expect(within(dialog).getByText('Saved to Friday, October 9 (the day you started).')).toBeInTheDocument();

    await u.clear(minutes);
    await u.type(minutes, '25');
    await u.type(within(dialog).getByLabelText(/^Note/), 'Pomodoro');
    await u.click(within(dialog).getByRole('button', { name: en.entry.form.save }));

    await waitFor(() => expect(within(read).getByText('25/30')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(en.toast.entrySaved));
    await waitFor(() => expect(screen.queryByTestId('timer-card')).toBeNull());
    expect(screen.queryByTestId('stop-dialog')).toBeNull();
    const entries = await tc!.container.db.entries.where('goalId').equals('g1').and((e) => e.date === '2026-10-09').toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ minutes: 25, note: 'Pomodoro', source: 'timer', date: '2026-10-09' });
    expect(await tc!.container.db.kv.get('activeTimer')).toBeUndefined();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());
    expect(within(read).getByRole('button', { name: en.goalCard.startTimer })).not.toHaveAttribute('aria-disabled');
  });

  it('Discard removes the timer without an entry; Keep running / Esc keeps it and returns focus to Stop', async () => {
    const u = userEvent.setup();
    await seededS1();
    await renderApp({ route: '/today', container: tc });
    const read = await screen.findByRole('article', { name: 'Read' });
    await u.click(within(read).getByRole('button', { name: en.goalCard.startTimer }));
    const card = await screen.findByTestId('timer-card');
    setClock(at('10:10:00'));
    await waitFor(() => expect(within(card).getByRole('timer')).toHaveTextContent('00:10:00'), TICK);
    const stopBtn = screen.getByRole('button', { name: /^Stop timer for Read/ });
    await u.click(stopBtn);
    const dialog = await screen.findByTestId('stop-dialog');
    await waitFor(() => expect(dialog).toHaveAttribute('open'));
    await waitFor(() => expect(within(dialog).getByLabelText(/^Minutes/)).toHaveValue('10'));

    await u.click(within(dialog).getByRole('button', { name: en.timer.keepRunning }));
    await waitFor(() => expect(screen.queryByTestId('stop-dialog')).toBeNull());
    expect(screen.getByTestId('timer-card')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop timer for Read/ })).toHaveFocus());

    await u.click(screen.getByRole('button', { name: /^Stop timer for Read/ }));
    const dialog2 = await screen.findByTestId('stop-dialog');
    await waitFor(() => expect(dialog2).toHaveAttribute('open'));
    act(() => {
      dialog2.dispatchEvent(new Event('cancel', { cancelable: true }));
    });
    await waitFor(() => expect(screen.queryByTestId('stop-dialog')).toBeNull());
    expect(screen.getByTestId('timer-card')).toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: /^Stop timer for Read/ }));
    const dialog3 = await screen.findByTestId('stop-dialog');
    await waitFor(() => expect(dialog3).toHaveAttribute('open'));
    const before = await tc!.container.db.entries.count();
    await u.click(within(dialog3).getByRole('button', { name: en.timer.discard }));
    await waitFor(() => expect(screen.queryByTestId('timer-card')).toBeNull());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(en.toast.timerDiscarded));
    expect(await tc!.container.db.entries.count()).toBe(before);
    expect(await tc!.container.db.kv.get('activeTimer')).toBeUndefined();
    expect(within(read).getByText('0/30')).toBeInTheDocument();
  });

  it('shows validation errors inside D1 and keeps the timer (minutes, outside goal period)', async () => {
    const u = userEvent.setup();
    await seededS1();
    await renderApp({ route: '/today', container: tc });
    const read = await screen.findByRole('article', { name: 'Read' });
    await u.click(within(read).getByRole('button', { name: en.goalCard.startTimer }));
    await screen.findByTestId('timer-card');
    await u.click(screen.getByRole('button', { name: /^Stop timer for Read/ }));
    const dialog = await screen.findByTestId('stop-dialog');
    await waitFor(() => expect(dialog).toHaveAttribute('open'));
    const minutes = within(dialog).getByLabelText(/^Minutes/);
    await waitFor(() => expect(minutes).toHaveValue('1'));
    await u.clear(minutes);
    await u.type(minutes, '0');
    await u.click(within(dialog).getByRole('button', { name: en.entry.form.save }));
    await waitFor(() => expect(minutes).toHaveAttribute('aria-invalid', 'true'));
    expect(within(dialog).getByText(en.errors.ENTRY_MINUTES_INVALID)).toBeInTheDocument();
    expect(minutes).toHaveFocus();
    expect(dialog).toHaveAttribute('open');

    // The goal was shortened meanwhile: the start day is now outside its period (M2-AC4).
    const g1 = (await tc!.container.db.goals.get('g1'))!;
    await tc!.container.db.goals.put({ ...g1, endDate: '2026-10-08' });
    await u.clear(minutes);
    await u.type(minutes, '10');
    await u.click(within(dialog).getByRole('button', { name: en.entry.form.save }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("That date is outside this goal's dates (2026-10-01 – 2026-10-08).");
    expect(await tc!.container.db.kv.get('activeTimer')).toBeDefined();
    // Goal is no longer active, but the timer card stays so the session can be discarded.
    expect(screen.getByTestId('timer-card')).toBeInTheDocument();
    await u.click(within(dialog).getByRole('button', { name: en.timer.discard }));
    await waitFor(() => expect(screen.queryByTestId('timer-card')).toBeNull());
  });

  it('double-clicking Start starts once and shows no error (M2-D3 UI regression)', async () => {
    const u = userEvent.setup();
    await seededS1();
    await renderApp({ route: '/today', container: tc });
    const read = await screen.findByRole('article', { name: 'Read' });
    const start = vitest.spyOn(tc!.container.timerService, 'start');
    await u.dblClick(within(read).getByRole('button', { name: en.goalCard.startTimer }));
    await screen.findByTestId('timer-card');
    await new Promise((r) => setTimeout(r, 100));
    expect(start).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
    expect((await tc!.container.db.kv.get('activeTimer'))?.value).toMatchObject({ goalId: 'g1' });
  });

  it('with a live query that never echoes the new timer, a double-click still starts once and the UI is optimistic (M2-D4, deterministic)', async () => {
    const u = userEvent.setup();
    await seededS1();
    // Simulate an arbitrarily delayed live query: emit the initial (empty) state only.
    vitest.spyOn(tc!.container.timerService, 'watch').mockReturnValue({
      subscribe: (onNext) => {
        onNext(undefined);
        return () => {};
      },
    });
    const start = vitest.spyOn(tc!.container.timerService, 'start');
    await renderApp({ route: '/today', container: tc });
    const read = await screen.findByRole('article', { name: 'Read' });
    await u.dblClick(within(read).getByRole('button', { name: en.goalCard.startTimer }));
    // Optimistic state from the start result: TimerCard, badge and disabled Start on the other goals.
    await screen.findByTestId('timer-card');
    expect(within(read).getByText(en.goalCard.timerRunningBadge)).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: 'Guitar' })).getByRole('button', { name: en.goalCard.startTimer })).toHaveAttribute('aria-disabled', 'true');
    expect(start).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
    expect((await tc!.container.db.kv.get('activeTimer'))?.value).toMatchObject({ goalId: 'g1' });
  });

  it('shows the start error inline when the service refuses', async () => {
    const u = userEvent.setup();
    await seededS1();
    await renderApp({ route: '/today', container: tc });
    const read = await screen.findByRole('article', { name: 'Read' });
    vitest.spyOn(tc!.container.timerService, 'start').mockResolvedValueOnce({ ok: false, errors: [{ code: 'TIMER_ALREADY_RUNNING', message: '' }] });
    await u.click(within(read).getByRole('button', { name: en.goalCard.startTimer }));
    expect(await within(read).findByRole('alert')).toHaveTextContent(en.errors.TIMER_ALREADY_RUNNING);
  });

  it('a running timer survives a remount with the right elapsed time (M2-AC2)', async () => {
    await seededS1();
    await tc!.container.db.kv.put({ key: 'activeTimer', value: { goalId: 'g1', startedAt: at('09:35:00').toISOString() } });
    await renderApp({ route: '/today', container: tc });
    const card = await screen.findByTestId('timer-card');
    expect(within(card).getByRole('timer')).toHaveTextContent('00:25:00');
    setClock(at('10:00:02'));
    await waitFor(() => expect(within(card).getByRole('timer')).toHaveTextContent('00:25:02'), TICK);
  });

  it('a timer on a goal that is no longer active still shows so it can be discarded', async () => {
    tc = await createTestContainer();
    await tc.container.db.goals.put(buildGoal({ id: 'old', name: 'Old', startDate: '2026-09-01', endDate: '2026-10-08' }));
    await tc.container.db.kv.put({ key: 'activeTimer', value: { goalId: 'old', startedAt: at('23:50:00', '2026-10-08').toISOString() } });
    await renderApp({ route: '/today', container: tc });
    const card = await screen.findByTestId('timer-card');
    expect(within(card).getByRole('heading', { level: 2, name: 'Timer running · Old' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: en.empty.today.noActive })).toBeNull();
  });

  it('vi: TimerCard, disabled Start, D1 (default and with error) have no English leaks; changing language keeps the elapsed time', async () => {
    const u = userEvent.setup();
    await seededS1('vi');
    await renderApp({ route: '/today', container: tc });
    const read = await screen.findByRole('article', { name: 'Read' });
    await u.click(within(read).getByRole('button', { name: vi.goalCard.startTimer }));
    const card = await screen.findByTestId('timer-card');
    expect(within(card).getByRole('heading', { level: 2, name: 'Đang đếm giờ · Read' })).toBeInTheDocument();
    expect(within(card).getByText(vi.timer.badge)).toBeInTheDocument();
    setClock(at('10:01:05'));
    await waitFor(() => expect(within(card).getByRole('timer', { name: vi.timer.elapsedLabel })).toHaveTextContent('00:01:05'), TICK);
    expect(within(card).getByRole('button', { name: 'Dừng đếm giờ cho Read, đã chạy 00:01:05' })).toHaveTextContent(vi.timer.stop);
    const guitarStart = within(screen.getByRole('article', { name: 'Guitar' })).getByRole('button', { name: vi.goalCard.startTimer });
    expect(guitarStart).toHaveAccessibleDescription(vi.goalCard.timerDisabled);
    expect(within(read).getByText(vi.goalCard.timerRunningBadge)).toBeInTheDocument();
    expect(scanVi()).toEqual([]);

    // Switching language while the timer runs does not reset it (M2-AC13).
    await tc!.container.locale.change('en');
    await waitFor(() => expect(within(card).getByRole('heading', { level: 2, name: 'Timer running · Read' })).toBeInTheDocument());
    expect(within(card).getByRole('timer')).toHaveTextContent('00:01:05');
    await tc!.container.locale.change('vi');
    await waitFor(() => expect(within(card).getByRole('heading', { level: 2, name: 'Đang đếm giờ · Read' })).toBeInTheDocument());
    expect(within(card).getByRole('timer')).toHaveTextContent('00:01:05');

    setClock(at('10:25:31'));
    await waitFor(() => expect(within(card).getByRole('timer')).toHaveTextContent('00:25:31'), TICK);
    await u.click(screen.getByRole('button', { name: /^Dừng đếm giờ cho Read/ }));
    const dialog = await screen.findByTestId('stop-dialog');
    await waitFor(() => expect(dialog).toHaveAttribute('open'));
    expect(within(dialog).getByRole('heading', { level: 2, name: vi.timer.dialogTitle })).toBeInTheDocument();
    expect(within(dialog).getByText('Read · đã đếm 00:25:31')).toBeInTheDocument();
    const minutes = within(dialog).getByLabelText(/^Số phút/);
    await waitFor(() => expect(minutes).toHaveValue('26'));
    expect(within(dialog).getByText('Làm tròn từ 25 phút 31 giây. Bạn có thể sửa lại.')).toBeInTheDocument();
    const viDate = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(2026, 9, 9));
    expect(within(dialog).getByText(`Sẽ lưu vào ${viDate} (ngày bạn bắt đầu).`)).toBeInTheDocument();
    expect(scanVi()).toEqual([]);

    await u.clear(minutes);
    await u.type(minutes, '0');
    await u.click(within(dialog).getByRole('button', { name: vi.entry.form.save }));
    await waitFor(() => expect(within(dialog).getByText(vi.errors.ENTRY_MINUTES_INVALID)).toBeInTheDocument());
    expect(scanVi()).toEqual([]);

    await u.clear(minutes);
    await u.type(minutes, '25');
    await u.click(within(dialog).getByRole('button', { name: vi.entry.form.save }));
    await waitFor(() => expect(within(read).getByText('25/30')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(vi.toast.entrySaved));
    expect(scanVi()).toEqual([]);
  });
});
