// QC M14 round 2 - M14-D1 across every place that offers sign-in on iOS when native Google is NOT available
// (VITE_GOOGLE_* missing): Settings account card (signed-out + expired), Today LoginPromptBanner, Settings ExportSignInHint.
// Apple must stay, Google must be gone, the web must be unchanged.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import en from '../../src/i18n/resources/en.json';
import { datasetS1 } from '../../src/test/builders';
import { createTestContainer, type TestContainer } from '../../src/test/container';
import { FakeIdTokenProvider } from '../../src/test/fake-id-token-provider';
import { renderApp } from '../../src/test/render-with-locale';

let tc: TestContainer | undefined;
afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

async function appleOnly(sheets: FakeIdTokenProvider = new FakeIdTokenProvider(['apple'])) {
  tc = await createTestContainer({ cloud: true, native: 'ios', idTokens: sheets });
  const { goals, entries } = datasetS1();
  await tc.container.db.goals.bulkPut(goals);
  await tc.container.db.entries.bulkPut(entries);
  await tc.container.authService.init();
  return tc;
}

describe('QC M14 r2: iOS with Apple only (no Google client ids)', () => {
  it('Today banner: Apple + Not now, no Google button, no empty wrapper', async () => {
    await appleOnly();
    await renderApp({ route: '/today', container: tc });
    const banner = await screen.findByTestId('login-prompt-banner');
    expect(within(banner).getAllByRole('button').map((b) => b.textContent)).toEqual([en.auth.signInApple, en.loginPrompt.notNow]);
    expect(within(banner).queryByTestId('google-sign-in')).toBeNull();
  });

  it('Settings account card signed-out: only Apple', async () => {
    await appleOnly();
    await renderApp({ route: '/settings', container: tc });
    const card = await screen.findByTestId('account-card');
    expect(within(card).queryByRole('button', { name: en.auth.signInGoogle })).toBeNull();
    expect(within(card).getByRole('button', { name: en.auth.signInApple })).toBeInTheDocument();
  });

  it('Export hint after a shared export: only Apple', async () => {
    const user = userEvent.setup();
    await appleOnly();
    await renderApp({ route: '/settings', container: tc });
    await user.click(await screen.findByRole('button', { name: en.settings.backup.export }));
    const hint = await screen.findByTestId('export-sign-in-hint');
    expect(within(hint).getAllByRole('button').map((b) => b.textContent)).toEqual([en.auth.signInApple]);
  });

  it('tapping Apple still signs in (goes through the Apple sheet, never the PKCE redirect)', async () => {
    const user = userEvent.setup();
    await appleOnly();
    await renderApp({ route: '/today', container: tc });
    const banner = await screen.findByTestId('login-prompt-banner');
    await user.click(within(banner).getByRole('button', { name: en.auth.signInApple }));
    await waitFor(() => expect(tc!.container.authService.state().kind).toBe('signed-in'));
    expect(tc!.auth!.idTokens!.calls).toEqual([{ method: 'getIdToken', provider: 'apple' }]);
    expect(tc!.auth!.port.calls.signIn).toBe(0);
  });

  it('sheets reporting nothing available (cannot happen with the real plugin: Apple needs no client id): Google gone, card does not crash, Apple button follows platform', async () => {
    await appleOnly(new FakeIdTokenProvider([]));
    await renderApp({ route: '/settings', container: tc });
    const card = await screen.findByTestId('account-card');
    expect(within(card).queryByRole('button', { name: en.auth.signInGoogle })).toBeNull();
    expect(within(card).queryByRole('button', { name: en.auth.signInApple })).not.toBeNull();
  });

  it('web (no native): the Google button is still the only sign-in button everywhere', async () => {
    tc = await createTestContainer({ cloud: true });
    const { goals, entries } = datasetS1();
    await tc.container.db.goals.bulkPut(goals);
    await tc.container.db.entries.bulkPut(entries);
    await tc.container.authService.init();
    await renderApp({ route: '/today', container: tc });
    const banner = await screen.findByTestId('login-prompt-banner');
    expect(within(banner).getByRole('button', { name: en.auth.signInGoogle })).toBeInTheDocument();
    expect(within(banner).queryByRole('button', { name: en.auth.signInApple })).toBeNull();
  });
});
