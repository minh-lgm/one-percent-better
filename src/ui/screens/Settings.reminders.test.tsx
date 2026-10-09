import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi as vitest } from 'vitest';
import type { NotificationPermissionState } from '../../domain/reminder';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import { createTestContainer, type TestContainer } from '../../test/container';
import { renderApp, scanVi } from '../../test/render-with-locale';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
  vitest.restoreAllMocks();
});

const STATES: NotificationPermissionState[] = ['default', 'granted', 'denied', 'unsupported'];
const CHIP = { default: en.settings.permission.default, granted: en.settings.permission.granted, denied: en.settings.permission.denied, unsupported: en.settings.permission.unsupported };
const DESC = {
  default: en.settings.permission.defaultDesc,
  granted: en.settings.permission.grantedDesc,
  denied: en.errors.NOTIFICATIONS_DENIED,
  unsupported: en.errors.NOTIFICATIONS_UNSUPPORTED,
};

describe('Settings — Reminders card (M2-AC6, M2-AC11, M2-AC13)', () => {
  it('defaults: switch off, time 20:00 disabled, limit text and iOS tip, .ics hint', async () => {
    const app = await renderApp({ route: '/settings' });
    tc = app.tc;
    expect(screen.getByRole('heading', { level: 2, name: en.settings.reminders.title })).toBeInTheDocument();
    const sw = screen.getByRole('switch', { name: en.settings.reminders.switch });
    await waitFor(() => expect(sw).toBeEnabled());
    expect(sw).not.toBeChecked();
    expect(sw).toHaveAccessibleDescription(en.settings.reminders.switchDesc);
    const time = screen.getByLabelText(en.settings.reminders.time) as HTMLInputElement;
    expect(time).toHaveValue('20:00');
    expect(time).toBeDisabled();
    expect(screen.getByText(en.settings.reminders.limit)).toBeInTheDocument();
    expect(screen.getByText(en.settings.reminders.ios)).toBeInTheDocument();
    expect(screen.getByText('Adds a repeating daily event at 20:00.')).toBeInTheDocument();
    // Card order: Language → Reminders → Backup → Storage → About (DESIGN S7).
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Language / Ngôn ngữ', en.settings.reminders.title, en.settings.backup.title, en.settings.storage.title, en.settings.about.title]);
  });

  it('turning the switch on saves the setting and asks for permission exactly once', async () => {
    const user = userEvent.setup();
    tc = await createTestContainer({ permission: 'default' });
    await renderApp({ route: '/settings', container: tc });
    const sw = screen.getByRole('switch', { name: en.settings.reminders.switch });
    await waitFor(() => expect(sw).toBeEnabled());
    expect(screen.getByText(CHIP.default)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.settings.reminders.allow })).toBeInTheDocument();

    await user.click(sw);
    await waitFor(() => expect(sw).toBeChecked());
    await waitFor(() => expect(tc!.notifications.requests).toBe(1));
    expect((await tc!.container.settingsService.get()).reminderEnabled).toBe(true);
    await waitFor(() => expect(screen.getByText(CHIP.granted)).toBeInTheDocument());
    expect(screen.getByText(DESC.granted)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en.settings.reminders.allow })).toBeNull();
    expect(screen.getByLabelText(en.settings.reminders.time)).toBeEnabled();

    await user.click(sw);
    await waitFor(() => expect(sw).not.toBeChecked());
    await user.click(sw);
    await waitFor(() => expect(sw).toBeChecked());
    expect(tc!.notifications.requests).toBe(1);
  });

  it('"Allow notifications" asks for permission; a denied answer shows the blocked state', async () => {
    const user = userEvent.setup();
    tc = await createTestContainer({ permission: 'default' });
    tc.notifications.nextAnswer = 'denied';
    await renderApp({ route: '/settings', container: tc });
    await user.click(screen.getByRole('button', { name: en.settings.reminders.allow }));
    await waitFor(() => expect(screen.getByText(CHIP.denied)).toBeInTheDocument());
    expect(screen.getByText(DESC.denied)).toBeInTheDocument();
    expect(tc.notifications.requests).toBe(1);
  });

  it.each(STATES)('shows the %s permission state with its description', async (state) => {
    tc = await createTestContainer({ permission: state });
    await renderApp({ route: '/settings', container: tc });
    expect(screen.getByText(CHIP[state])).toBeInTheDocument();
    expect(screen.getByTestId('permission-desc')).toHaveTextContent(DESC[state]);
    if (state === 'default') expect(screen.getByRole('button', { name: en.settings.reminders.allow })).toBeInTheDocument();
    else expect(screen.queryByRole('button', { name: en.settings.reminders.allow })).toBeNull();
  });

  it('changing the time saves it, shows a toast and updates the .ics hint', async () => {
    tc = await createTestContainer({ permission: 'granted' });
    await tc.container.settingsService.setReminderEnabled(true);
    await renderApp({ route: '/settings', container: tc });
    const time = screen.getByLabelText(en.settings.reminders.time);
    await waitFor(() => expect(time).toBeEnabled());
    fireEvent.focus(time);
    fireEvent.change(time, { target: { value: '07:30' } });
    await waitFor(async () => expect((await tc!.container.settingsService.get()).reminderTime).toBe('07:30'));
    await waitFor(() => expect(screen.getByText('Adds a repeating daily event at 07:30.')).toBeInTheDocument());
    // One toast once the value settles (here: on blur).
    expect(screen.getByRole('status')).toHaveTextContent('');
    fireEvent.blur(time);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(en.toast.reminderTime));
    expect(time).toHaveValue('07:30');
    // An empty/invalid value (half-typed segment or cleared picker) is shown but not saved (M2-D1).
    fireEvent.focus(time);
    fireEvent.change(time, { target: { value: '' } });
    expect(time).toHaveValue('');
    expect((await tc!.container.settingsService.get()).reminderTime).toBe('07:30');
    fireEvent.blur(time);
    expect(time).toHaveValue('07:30');
  });

  it('downloads the .ics file with the current time and language', async () => {
    const user = userEvent.setup();
    tc = await createTestContainer({ permission: 'granted' });
    await tc.container.settingsService.update({ reminderEnabled: true, reminderTime: '07:30' });
    await renderApp({ route: '/settings', container: tc });
    const blobs: Blob[] = [];
    const createObjectURL = vitest.fn((b: Blob) => {
      blobs.push(b);
      return 'blob:ics';
    });
    Object.assign(URL, { createObjectURL, revokeObjectURL: vitest.fn() });
    const clicks: HTMLAnchorElement[] = [];
    vitest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this);
    });
    await waitFor(() => expect(screen.getByText('Adds a repeating daily event at 07:30.')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: en.settings.reminders.ics }));
    expect(clicks).toHaveLength(1);
    expect(clicks[0].download).toBe('1percent-better-reminder.ics');
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blobs[0]);
    });
    expect(text).toContain('DTSTART:20261010T073000\r\n');
    expect(text).toContain(`SUMMARY:${en.ics.summary}\r\n`);
    expect(text).toContain('RRULE:FREQ=DAILY\r\n');
    expect(screen.getByRole('status')).toHaveTextContent(en.toast.icsDownloaded);
  });

  it.each(STATES)('vi: no English leaks in the %s permission state; time stays 20:00', async (state) => {
    tc = await createTestContainer({ locale: 'vi', permission: state });
    await renderApp({ route: '/settings', container: tc });
    expect(screen.getByRole('heading', { level: 2, name: vi.settings.reminders.title })).toBeInTheDocument();
    const sw = screen.getByRole('switch', { name: vi.settings.reminders.switch });
    await waitFor(() => expect(sw).toBeEnabled());
    expect(screen.getByLabelText(vi.settings.reminders.time)).toHaveValue('20:00');
    expect(screen.getByText(vi.settings.permission[state])).toBeInTheDocument();
    expect(screen.getByText('Thêm một sự kiện lặp lại hằng ngày lúc 20:00.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(vi.settings.storage.protected)).toBeInTheDocument());
    expect(within(screen.getByTestId('permission-desc')).getByText(state === 'denied' ? vi.errors.NOTIFICATIONS_DENIED : state === 'unsupported' ? vi.errors.NOTIFICATIONS_UNSUPPORTED : state === 'granted' ? vi.settings.permission.grantedDesc : vi.settings.permission.defaultDesc)).toBeInTheDocument();
    expect(scanVi()).toEqual([]);
  });
});
