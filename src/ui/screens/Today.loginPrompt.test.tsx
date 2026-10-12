import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import { buildGoal, datasetS1 } from '../../test/builders';
import { createTestContainer, setTestOnline, type TestContainer } from '../../test/container';
import { USER1 } from '../../test/fake-auth-port';
import { renderApp, scanVi } from '../../test/render-with-locale';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

/** Cloud on, signed out, S1 on the device (23 entries, first record 2026-10-01 → both FR-52 thresholds met). */
async function cloudWithS1(options: Parameters<typeof createTestContainer>[0] = {}) {
  tc = await createTestContainer({ cloud: true, ...options });
  const { goals, entries } = datasetS1();
  await tc.container.db.goals.bulkPut(goals);
  await tc.container.db.entries.bulkPut(entries);
  await tc.container.authService.init();
  return tc;
}

const banner = () => screen.getByTestId('login-prompt-banner');

describe('Today — LoginPromptBanner (FR-52, M8-AC2, DESIGN S1/F14/8.1)', () => {
  it('cloud on + S1 + signed out: a plain section with title, body, Google button and "Not now"; no dialog, no live region; BackupBanner hidden; goals still usable', async () => {
    await cloudWithS1();
    await renderApp({ route: '/today', container: tc });
    await waitFor(() => expect(banner()).toBeInTheDocument());
    const b = banner();
    expect(b.tagName).toBe('SECTION');
    expect(b).toHaveAttribute('aria-label', en.loginPrompt.label);
    expect(b).not.toHaveAttribute('role');
    expect(b).not.toHaveAttribute('aria-modal');
    expect(b).not.toHaveAttribute('aria-live');
    expect(within(b).getByText(en.loginPrompt.title)).toBeInTheDocument();
    expect(within(b).getByText(en.loginPrompt.body)).toBeInTheDocument();
    expect(within(b).getByRole('button', { name: en.auth.signInGoogle })).toBeEnabled();
    expect(within(b).getByRole('button', { name: en.loginPrompt.notNow })).toBeEnabled();
    expect(screen.queryByTestId('backup-banner')).toBeNull();
    expect(document.activeElement).not.toBe(b);
    expect(b.contains(document.activeElement)).toBe(false);
    // Order: banner above the goal list; goals render and the entry form still opens.
    const list = screen.getByRole('list', { name: en.today.goalsLabel });
    expect(b.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const user = userEvent.setup();
    await user.click(within(within(list).getAllByRole('article')[0]).getByRole('button', { name: en.goalCard.logTime }));
    expect(screen.getByLabelText(new RegExp(`^${en.entry.form.minutesLabel}`))).toBeInTheDocument();
  });

  it('"Not now": banner gone, toast, focus on the h1, kv loginPrompt dismissCount 1, BackupBanner takes its place', async () => {
    const user = userEvent.setup();
    await cloudWithS1();
    await renderApp({ route: '/today', container: tc });
    await waitFor(() => expect(banner()).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: en.loginPrompt.notNow }));
    await waitFor(() => expect(screen.queryByTestId('login-prompt-banner')).toBeNull());
    expect(screen.getByTestId('toast')).toHaveTextContent(en.loginPrompt.snoozedToast);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 })));
    expect(await tc!.container.loginPromptService.getState()).toMatchObject({ dismissCount: 1 });
    expect(screen.getByTestId('backup-banner')).toBeInTheDocument();
  });

  it('"Sign in with Google" on the banner → signIn("#/today"); the banner stays, busy, while signing in', async () => {
    const user = userEvent.setup();
    await cloudWithS1();
    await renderApp({ route: '/today', container: tc });
    await waitFor(() => expect(banner()).toBeInTheDocument());
    await user.click(within(banner()).getByRole('button', { name: en.auth.signInGoogle }));
    await waitFor(() => expect(tc!.container.authService.state().kind).toBe('signing-in'));
    expect(tc!.auth!.returnTo.value).toBe('#/today');
    expect(within(banner()).getByRole('button', { name: en.auth.signingIn })).toBeDisabled();
    expect(within(banner()).getByRole('button', { name: en.loginPrompt.notNow })).toBeDisabled();
  });

  it('never shown: cloud off (BackupBanner as in M3), signed in, offline, or too little data', async () => {
    // Cloud off: phase-1 behaviour.
    tc = await createTestContainer();
    const { goals, entries } = datasetS1();
    await tc.container.db.goals.bulkPut(goals);
    await tc.container.db.entries.bulkPut(entries);
    let app = await renderApp({ route: '/today', container: tc });
    await waitFor(() => expect(screen.getByTestId('backup-banner')).toBeInTheDocument());
    expect(screen.queryByTestId('login-prompt-banner')).toBeNull();
    app.unmount();
    await tc.dispose();

    // Signed in.
    await cloudWithS1({ authStored: true });
    tc!.auth!.port.session = USER1;
    await tc!.container.db.kv.put({ key: 'sync', value: { userId: USER1.userId, account: { email: USER1.email, name: USER1.name } } });
    await tc!.container.authService.init();
    await tc!.container.authService.settled();
    app = await renderApp({ route: '/today', container: tc });
    await screen.findByRole('list', { name: en.today.goalsLabel });
    expect(screen.queryByTestId('login-prompt-banner')).toBeNull();
    app.unmount();
    await tc!.dispose();

    // Offline → hidden; back online → shown.
    await cloudWithS1({ online: false });
    app = await renderApp({ route: '/today', container: tc });
    await screen.findByRole('list', { name: en.today.goalsLabel });
    expect(screen.queryByTestId('login-prompt-banner')).toBeNull();
    setTestOnline(tc!, true);
    await waitFor(() => expect(banner()).toBeInTheDocument());
    app.unmount();
    await tc!.dispose();

    // One goal created today, no entries.
    tc = await createTestContainer({ cloud: true });
    await tc.container.db.goals.put(buildGoal({ id: 'g1', name: 'Read', createdAt: new Date().toISOString() }));
    await tc.container.authService.init();
    await renderApp({ route: '/today', container: tc });
    await screen.findByRole('list', { name: en.today.goalsLabel });
    expect(screen.queryByTestId('login-prompt-banner')).toBeNull();
  });

  it('vi: strings from DESIGN 7.7.4, no English leaks', async () => {
    await cloudWithS1({ locale: 'vi' });
    await renderApp({ route: '/today', container: tc, locale: 'vi' });
    await waitFor(() => expect(banner()).toBeInTheDocument());
    expect(banner()).toHaveAttribute('aria-label', vi.loginPrompt.label);
    expect(within(banner()).getByText(vi.loginPrompt.title)).toBeInTheDocument();
    expect(within(banner()).getByRole('button', { name: vi.auth.signInGoogle })).toBeInTheDocument();
    expect(within(banner()).getByRole('button', { name: vi.loginPrompt.notNow })).toBeInTheDocument();
    expect(scanVi()).toEqual([]);
  });
});
