// M14-AC7: LoginPromptBanner (Today) and ExportSignInHint (Settings › Backup) on iOS carry the Apple button above
// the Google button; on the web they are unchanged (DESIGN 5 `SignInButtons`, 7.8.2).
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

async function iosWithS1(options: Parameters<typeof createTestContainer>[0] = {}) {
  tc = await createTestContainer({ cloud: true, native: 'ios', idTokens: true, ...options });
  const { goals, entries } = datasetS1();
  await tc.container.db.goals.bulkPut(goals);
  await tc.container.db.entries.bulkPut(entries);
  await tc.container.authService.init();
  return tc;
}

describe('LoginPromptBanner on iOS', () => {
  it("Apple above Google, then Not now; Apple → authService.signIn('#/today', 'apple'); the banner stays busy on the tapped button, the other disabled", async () => {
    const user = userEvent.setup();
    await iosWithS1();
    // Keep the sheet open until the test releases it (the user is looking at the Apple sheet).
    let release: () => void = () => undefined;
    tc!.auth!.idTokens!.gate.apple = new Promise<void>((resolve) => {
      release = resolve;
    });
    await renderApp({ route: '/today', container: tc });
    const banner = await screen.findByTestId('login-prompt-banner');
    const buttons = within(banner).getAllByRole('button').map((b) => b.textContent);
    expect(buttons).toEqual([en.auth.signInApple, en.auth.signInGoogle, en.loginPrompt.notNow]);
    await user.click(within(banner).getByRole('button', { name: en.auth.signInApple }));
    await waitFor(() => expect(tc!.container.authService.state().kind).toBe('signing-in'));
    expect(tc!.auth!.returnTo.value).toBeNull();
    expect(tc!.auth!.idTokens!.calls).toEqual([{ method: 'getIdToken', provider: 'apple' }]);
    const busy = within(banner).getByTestId('apple-sign-in');
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(busy).toHaveTextContent(en.auth.signingIn);
    expect(within(banner).getByTestId('google-sign-in')).toBeDisabled();
    expect(within(banner).getByRole('button', { name: en.loginPrompt.notNow })).toBeDisabled();
    release();
    await waitFor(() => expect(tc!.container.authService.state().kind).toBe('signed-in'));
    await waitFor(() => expect(screen.queryByTestId('login-prompt-banner')).toBeNull());
    expect(screen.getByTestId('toast')).toHaveTextContent(/Signed in/);
  });

  it('vi: the iOS banner scans clean', async () => {
    await iosWithS1({ locale: 'vi' });
    await renderApp({ route: '/today', container: tc });
    const banner = await screen.findByTestId('login-prompt-banner');
    expect(within(banner).getByRole('button', { name: vi.auth.signInApple })).toBeInTheDocument();
    expect(scanVi()).toEqual([]);
  });

  it('web: only the Google button, exactly as in M8', async () => {
    tc = await createTestContainer({ cloud: true });
    const { goals, entries } = datasetS1();
    await tc.container.db.goals.bulkPut(goals);
    await tc.container.db.entries.bulkPut(entries);
    await tc.container.authService.init();
    await renderApp({ route: '/today', container: tc });
    const banner = await screen.findByTestId('login-prompt-banner');
    expect(within(banner).queryByRole('button', { name: en.auth.signInApple })).toBeNull();
    expect(within(banner).getByRole('button', { name: en.auth.signInGoogle })).toBeInTheDocument();
  });
});

describe('ExportSignInHint on iOS', () => {
  it('after a shared export: native wording, Apple above Google; Google → signIn via the Google sheet', async () => {
    const user = userEvent.setup();
    await iosWithS1();
    await renderApp({ route: '/settings', container: tc });
    await user.click(await screen.findByRole('button', { name: en.settings.backup.export }));
    const hint = await screen.findByTestId('export-sign-in-hint');
    expect(hint).toHaveTextContent(en.exportHint.textNative);
    expect(hint).not.toHaveTextContent(en.exportHint.text);
    const buttons = within(hint).getAllByRole('button').map((b) => b.textContent);
    expect(buttons).toEqual([en.auth.signInApple, en.auth.signInGoogle]);
    await user.click(within(hint).getByRole('button', { name: en.auth.signInGoogle }));
    await waitFor(() => expect(tc!.container.authService.state().kind).toBe('signed-in'));
    expect(tc!.auth!.idTokens!.calls).toEqual([{ method: 'getIdToken', provider: 'google' }]);
    expect(tc!.auth!.port.calls.signIn).toBe(0);
  });
});
