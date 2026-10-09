import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi as vitest } from 'vitest';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import { buildEntry, buildGoal, datasetS1 } from '../../test/builders';
import { createTestContainer, type TestContainer } from '../../test/container';
import { renderApp, scanVi } from '../../test/render-with-locale';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

const at = (hhmmss: string) => new Date(`2026-10-09T${hhmmss}+07:00`);

async function withReadGoal(locale: 'en' | 'vi' = 'en') {
  tc = await createTestContainer({ locale, permission: 'denied' });
  await tc.container.db.goals.put(buildGoal({ id: 'g1', name: 'Read', targetMinutes: 30, startDate: '2026-10-01', endDate: '2026-10-31' }));
  await tc.container.settingsService.update({ reminderEnabled: true, reminderTime: '20:00' });
  return tc;
}

describe('ReminderBanner on Today (M2-AC10)', () => {
  it('shows after the reminder time when a goal is not on target, even without notification permission', async () => {
    vitest.setSystemTime(at('20:01:00'));
    await withReadGoal();
    await renderApp({ route: '/today', container: tc });
    const banner = await screen.findByRole('status', { name: en.reminder.bannerLabel });
    expect(banner).toHaveTextContent("It's past 20:00 — 1 goal is not on target yet.");
    expect(tc!.notifications.state).toBe('denied');
  });

  it('is hidden before the reminder time and when the reminder is off', async () => {
    vitest.setSystemTime(at('19:59:00'));
    await withReadGoal();
    const app = await renderApp({ route: '/today', container: tc });
    await screen.findByRole('article', { name: 'Read' });
    expect(screen.queryByTestId('reminder-banner')).toBeNull();
    app.unmount();

    vitest.setSystemTime(at('20:01:00'));
    await tc!.container.settingsService.setReminderEnabled(false);
    await renderApp({ route: '/today', container: tc });
    await screen.findByRole('article', { name: 'Read' });
    expect(screen.queryByTestId('reminder-banner')).toBeNull();
  });

  it('disappears without reload once every active goal is on target', async () => {
    vitest.setSystemTime(at('20:01:00'));
    const user = userEvent.setup();
    await withReadGoal();
    await renderApp({ route: '/today', container: tc });
    await screen.findByTestId('reminder-banner');
    const card = screen.getByRole('article', { name: 'Read' });
    await user.click(within(card).getByRole('button', { name: en.goalCard.logTime }));
    await user.type(within(card).getByLabelText(/^Minutes/), '30');
    await user.click(within(card).getByRole('button', { name: en.entry.form.save }));
    await waitFor(() => expect(screen.queryByTestId('reminder-banner')).toBeNull());
    expect(within(card).getByTestId('plus-one')).toBeInTheDocument();
  });

  it('counts goals with the plural form; upcoming and ended goals are ignored', async () => {
    vitest.setSystemTime(at('20:30:00'));
    tc = await createTestContainer({ permission: 'denied' });
    const { goals, entries } = datasetS1();
    await tc.container.db.goals.bulkPut(goals);
    await tc.container.db.entries.bulkPut(entries);
    await tc.container.settingsService.update({ reminderEnabled: true, reminderTime: '20:00' });
    await renderApp({ route: '/today', container: tc });
    expect(await screen.findByTestId('reminder-banner')).toHaveTextContent("It's past 20:00 — 3 goals are not on target yet.");
    await tc.container.db.entries.put(buildEntry({ id: 'x', goalId: 'g2', minutes: 20 }));
    await waitFor(() => expect(screen.getByTestId('reminder-banner')).toHaveTextContent("It's past 20:00 — 2 goals are not on target yet."));
  });

  it('vi: banner for 1 goal and 3 goals has no English leaks', async () => {
    vitest.setSystemTime(at('20:01:00'));
    await withReadGoal('vi');
    await renderApp({ route: '/today', container: tc });
    const banner = await screen.findByRole('status', { name: vi.reminder.bannerLabel });
    expect(banner).toHaveTextContent('Đã quá 20:00 — còn 1 mục tiêu chưa đạt chỉ tiêu.');
    expect(scanVi()).toEqual([]);
    await tc!.container.db.goals.bulkPut([buildGoal({ id: 'g2', name: 'Guitar', targetMinutes: 20 }), buildGoal({ id: 'g3', name: 'Spanish', targetMinutes: 17 })]);
    await waitFor(() => expect(screen.getByTestId('reminder-banner')).toHaveTextContent('Đã quá 20:00 — còn 3 mục tiêu chưa đạt chỉ tiêu.'));
    expect(scanVi()).toEqual([]);
  });
});
