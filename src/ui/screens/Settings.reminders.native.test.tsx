// M15-AC5 / M15-AC11: the Reminders card on iOS with scheduled notifications (DESIGN v5.0 7.8.4, S7 "tiếp" M15 column)
// and the About links (7.8.5), driven by `capabilities.scheduledNotifications` from a fake scheduling port.
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { NotificationPermissionState } from '../../domain/reminder';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import { buildEntry, buildGoal } from '../../test/builders';
import { createTestContainer, type TestContainer } from '../../test/container';
import { pendingSchedule } from '../../test/notifications';
import { renderApp, scanVi } from '../../test/render-with-locale';

let tc: TestContainer | undefined;
afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

async function ios(options: { permission?: NotificationPermissionState; locale?: 'en' | 'vi'; reminderEnabled?: boolean } = {}) {
  tc = await createTestContainer({ native: 'ios', scheduledNotifications: true, permission: options.permission ?? 'default', locale: options.locale ?? 'en' });
  await tc.container.db.goals.put(buildGoal({ id: 'g1', name: 'Read' }));
  await tc.container.db.entries.put(buildEntry({ id: 'e1', goalId: 'g1', minutes: 20 }));
  if (options.reminderEnabled) await tc.container.settingsService.update({ reminderEnabled: true });
  await renderApp({ route: '/settings', container: tc, locale: options.locale ?? 'en' });
  expect(await screen.findByRole('heading', { level: 1, name: (options.locale === 'vi' ? vi : en).settings.title })).toBeInTheDocument();
  return tc;
}

const reminders = () => screen.getByRole('heading', { level: 2, name: en.settings.reminders.title }).closest('section')!;

describe('Reminders card on iOS with scheduled notifications (M15-AC5)', () => {
  it('en, permission default: chip "Not asked yet" + native description, Allow button, native switch text and 14-day info; no web-only copy, no .ics', async () => {
    await ios({ permission: 'default' });
    const card = reminders();
    expect(within(card).getByText(en.settings.permission.default)).toBeInTheDocument();
    expect(screen.getByTestId('permission-desc')).toHaveTextContent(en.settings.permission.nativeDefaultDesc);
    expect(within(card).getByRole('button', { name: en.settings.reminders.allow })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: en.settings.reminders.switch })).toHaveAccessibleDescription(en.settings.reminders.nativeSwitchDesc);
    expect(screen.getByTestId('reminders-native-info')).toHaveTextContent(en.settings.reminders.nativeInfo);
    // Gone on iOS from M15: "only while open", the Home Screen tip, the "Not supported" chip, the .ics button + hint.
    expect(screen.queryByText(en.settings.reminders.limit)).toBeNull();
    expect(screen.queryByText(en.settings.reminders.ios)).toBeNull();
    expect(screen.queryByText(en.settings.permission.unsupported)).toBeNull();
    expect(screen.queryByText(en.settings.permission.nativeUnsupportedDesc)).toBeNull();
    expect(screen.queryByRole('button', { name: en.settings.reminders.ics })).toBeNull();
    expect(screen.queryByText(/Adds a repeating daily event/)).toBeNull();
    expect(screen.queryByText(en.settings.reminders.switchDesc)).toBeNull();
    expect(document.body.textContent).not.toContain('browser');
    expect(document.body.textContent).not.toContain('Add to Home Screen');
  });

  it('permission granted → "Allowed" + native granted text, no Allow button', async () => {
    await ios({ permission: 'granted' });
    expect(within(reminders()).getByText(en.settings.permission.granted)).toBeInTheDocument();
    expect(screen.getByTestId('permission-desc')).toHaveTextContent(en.settings.permission.nativeGrantedDesc);
    expect(screen.queryByRole('button', { name: en.settings.reminders.allow })).toBeNull();
  });

  it('permission denied → "Blocked" + the iOS Settings guidance (DESIGN nativeDeniedDesc), no web copy', async () => {
    await ios({ permission: 'denied' });
    expect(within(reminders()).getByText(en.settings.permission.denied)).toBeInTheDocument();
    expect(screen.getByTestId('permission-desc')).toHaveTextContent(en.settings.permission.nativeDeniedDesc);
    expect(screen.getByTestId('permission-desc')).toHaveTextContent('Open the Settings app on your iPhone');
    expect(screen.queryByText(en.errors.NOTIFICATIONS_DENIED)).toBeNull();
    expect(screen.queryByRole('button', { name: en.settings.reminders.allow })).toBeNull();
  });

  it('reminder already on (synced from the account) but not asked yet → the "Reminders are on, but this iPhone…" text (A-64)', async () => {
    await ios({ permission: 'default', reminderEnabled: true });
    expect(screen.getByTestId('permission-desc')).toHaveTextContent(en.settings.permission.nativeDefaultOnDesc);
    expect(within(reminders()).getByRole('button', { name: en.settings.reminders.allow })).toBeInTheDocument();
    expect(tc!.notifications.requests).toBe(0); // nothing asked automatically
  });

  it('turning the switch on with permission default asks exactly once, and once granted the 14-day schedule is written', async () => {
    const user = userEvent.setup();
    await ios({ permission: 'default' });
    const sw = screen.getByRole('switch', { name: en.settings.reminders.switch });
    await waitFor(() => expect(sw).toBeEnabled());
    await user.click(sw);
    await waitFor(() => expect(sw).toBeChecked());
    await waitFor(() => expect(tc!.notifications.requests).toBe(1));
    await waitFor(() => expect(screen.getByText(en.settings.permission.granted)).toBeInTheDocument());
    expect(screen.getByTestId('permission-desc')).toHaveTextContent(en.settings.permission.nativeGrantedDesc);
    await waitFor(() => expect(pendingSchedule(tc!.notifications)).toHaveLength(14));
    expect(pendingSchedule(tc!.notifications)[0].title).toBe(en.notification.nativeTitle);
    expect(pendingSchedule(tc!.notifications)[0].url).toBe('#/today');
  });

  it('the Allow button asks once; the adapter cache is refreshed on mount', async () => {
    const user = userEvent.setup();
    await ios({ permission: 'default' });
    expect(tc!.notifications.refreshes).toBeGreaterThanOrEqual(1);
    await user.click(screen.getByRole('button', { name: en.settings.reminders.allow }));
    await waitFor(() => expect(tc!.notifications.requests).toBe(1));
    await waitFor(() => expect(screen.queryByRole('button', { name: en.settings.reminders.allow })).toBeNull());
  });

  it('vi: native copy verbatim, no English leaks (M15-AC11)', async () => {
    await ios({ permission: 'denied', locale: 'vi' });
    expect(screen.getByText(vi.settings.permission.denied)).toBeInTheDocument();
    expect(screen.getByTestId('permission-desc')).toHaveTextContent(vi.settings.permission.nativeDeniedDesc);
    expect(screen.getByRole('switch', { name: vi.settings.reminders.switch })).toHaveAccessibleDescription(vi.settings.reminders.nativeSwitchDesc);
    expect(screen.getByTestId('reminders-native-info')).toHaveTextContent(vi.settings.reminders.nativeInfo);
    expect(screen.queryByText(vi.settings.reminders.limit)).toBeNull();
    expect(screen.queryByRole('button', { name: vi.settings.reminders.ics })).toBeNull();
    expect(scanVi()).toEqual([]);
  });

  it('the M12 … M14 native runtime (no scheduling adapter) is unchanged: "Not supported", .ics button stays', async () => {
    tc = await createTestContainer({ native: 'ios' });
    await renderApp({ route: '/settings', container: tc });
    expect(await screen.findByText(en.settings.permission.unsupported)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.settings.reminders.ics })).toBeInTheDocument();
    expect(screen.queryByTestId('reminders-native-info')).toBeNull();
  });

  it('the web is unchanged: limit text, web permission copy, .ics button', async () => {
    tc = await createTestContainer({ permission: 'default' });
    await renderApp({ route: '/settings', container: tc });
    expect(await screen.findByText(en.settings.reminders.limit)).toBeInTheDocument();
    expect(screen.getByTestId('permission-desc')).toHaveTextContent(en.settings.permission.defaultDesc);
    expect(screen.getByRole('button', { name: en.settings.reminders.ics })).toBeInTheDocument();
  });
});

describe('About links (DESIGN 7.8.5, M15-AC7)', () => {
  it('native: Privacy then Support, absolute, opened by Safari, with the hidden "(opens in Safari)"', async () => {
    await ios();
    const privacy = screen.getByTestId('privacy-link');
    const support = screen.getByTestId('support-link');
    expect(support).toHaveAttribute('href', 'https://minh-lgm.github.io/one-percent-better/support.html');
    expect(support).toHaveAttribute('target', '_blank');
    expect(support).toHaveAttribute('rel', 'noopener');
    expect(support).toHaveAccessibleName(`${en.settings.about.supportLink} ${en.a11y.opensExternal}`);
    expect(privacy.compareDocumentPosition(support) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('web: relative links in the same tab, Support under Privacy; vi copy', async () => {
    tc = await createTestContainer({ locale: 'vi' });
    await renderApp({ route: '/settings', container: tc, locale: 'vi' });
    const support = await screen.findByTestId('support-link');
    expect(support).toHaveAttribute('href', '/support.html');
    expect(support).not.toHaveAttribute('target');
    expect(support).toHaveAccessibleName(vi.settings.about.supportLink);
    expect(screen.getByTestId('privacy-link')).toHaveAccessibleName(vi.settings.about.privacyLink);
    expect(scanVi()).toEqual([]);
  });
});

describe('permission refresh when the app comes back (M15)', () => {
  it('visibilitychange re-reads the adapter: denied → granted after the user allowed notifications in iOS Settings', async () => {
    await ios({ permission: 'denied' });
    expect(screen.getByText(en.settings.permission.denied)).toBeInTheDocument();
    tc!.notifications.state = 'granted';
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(screen.getByText(en.settings.permission.granted)).toBeInTheDocument());
    expect(screen.getByTestId('permission-desc')).toHaveTextContent(en.settings.permission.nativeGrantedDesc);
  });
});
