// M14-AC7 / M14-AC11: the Account card on iOS (`capabilities.appleSignIn`), the Delete account block, the Apple
// revocation panel, in en and vi (DESIGN S7 "Card Account trên iOS", 5 "Nút Sign in with Apple", 8.3).
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi as vitest } from 'vitest';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import type { AuthState } from '../../services/auth-service';
import { createTestContainer, type TestContainer } from '../../test/container';
import { renderWithLocale, scanVi } from '../../test/render-with-locale';
import { AccountCard } from './AccountCard';
import { APPLE_REVOKE_HELP_URL } from './AppleRevokePanel';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

/** Unmount the current card and dispose its container (tests that render several states in a row). */
async function next() {
  cleanup();
  await tc?.dispose();
  tc = undefined;
}

const SIGNED_IN: AuthState = { kind: 'signed-in', userId: 'u1', email: 'minh.test@example.com', name: 'Minh Test', providers: ['google'] };
const APPLE_IN: AuthState = { ...SIGNED_IN, email: 'abc123@privaterelay.appleid.com', providers: ['apple'] };

type Platform = 'web' | 'ios' | 'android';

async function renderCard(auth: Exclude<AuthState, { kind: 'unavailable' }>, { platform = 'ios', locale = 'en', online = true, revokePanel = false }: { platform?: Platform; locale?: 'en' | 'vi'; online?: boolean; revokePanel?: boolean } = {}) {
  tc = await createTestContainer(platform === 'web' ? { locale, cloud: true } : { locale, cloud: true, native: platform, idTokens: true });
  const handlers = { onSignIn: vitest.fn(), onSignOut: vitest.fn(), onDismissError: vitest.fn(), onDeleteAccount: vitest.fn(), onDismissRevoke: vitest.fn() };
  const r = await renderWithLocale(<AccountCard auth={auth} online={online} revokePanel={revokePanel} {...handlers} />, locale, { container: tc });
  return { ...r, handlers };
}

type Copy = { auth: { signInApple: string; signInGoogle: string } };
const apple = (copy: Copy = en) => screen.queryByRole('button', { name: copy.auth.signInApple });
const google = (copy: Copy = en) => screen.getByRole('button', { name: copy.auth.signInGoogle });

describe('A1 signed-out on iOS (M14-AC7)', () => {
  for (const [locale, copy] of [
    ['en', en],
    ['vi', vi],
  ] as const) {
    it(`${locale}: Apple button (accessible name = label, 44 px, glyph hidden) ABOVE Google, same width; iOS copy + Hide My Email note; click → onSignIn('apple')`, async () => {
      const user = userEvent.setup();
      const { handlers } = await renderCard({ kind: 'signed-out' }, { locale });
      const a = apple(copy);
      expect(a).not.toBeNull();
      expect(a).toHaveAttribute('type', 'button');
      expect(a).toHaveTextContent(copy.auth.signInApple);
      expect(a).not.toHaveAttribute('aria-label');
      expect(a!.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
      expect(a).toHaveClass('abtn', 'full');
      // Order in the DOM = order on screen = Tab order: Apple first, Google second, inside the stacked group.
      const group = screen.getByTestId('sign-in-buttons');
      const buttons = within(group).getAllByRole('button');
      expect(buttons.map((b) => b.textContent)).toEqual([copy.auth.signInApple, copy.auth.signInGoogle]);
      expect(group).toHaveClass('signin-buttons');
      expect(screen.getByText(copy.settings.account.descSignedOutIos)).toBeInTheDocument();
      expect(screen.getByText(copy.settings.account.privacyNoteIos)).toBeInTheDocument();
      expect(screen.getByTestId('hide-email-note')).toHaveTextContent(copy.settings.account.hideEmailNote);
      expect(screen.queryByText(copy.settings.account.descSignedOut)).toBeNull();
      expect(screen.queryByText(copy.settings.account.privacyNote)).toBeNull();
      await user.click(a!);
      expect(handlers.onSignIn).toHaveBeenCalledWith('apple');
      await user.click(google(copy));
      expect(handlers.onSignIn).toHaveBeenLastCalledWith('google');
      expect(handlers.onSignIn).toHaveBeenCalledTimes(2);
      // Tab order: Apple → Google.
      a!.focus();
      await user.tab();
      expect(document.activeElement).toBe(google(copy));
      if (locale === 'vi') expect(scanVi()).toEqual([]);
    });
  }

  it('web: no element named "Sign in with Apple"; the v2 copy and the single Google button are unchanged', async () => {
    await renderCard({ kind: 'signed-out' }, { platform: 'web' });
    expect(apple()).toBeNull();
    expect(screen.queryByTestId('sign-in-buttons')).toBeNull();
    expect(google()).toBeInTheDocument();
    expect(screen.getByText(en.settings.account.descSignedOut)).toBeInTheDocument();
    expect(screen.getByText(en.settings.account.privacyNote)).toBeInTheDocument();
    expect(screen.queryByTestId('hide-email-note')).toBeNull();
  });

  it('android (native sign-in without Apple): Google only, web copy', async () => {
    await renderCard({ kind: 'signed-out' }, { platform: 'android' });
    expect(apple()).toBeNull();
    expect(google()).toBeInTheDocument();
    expect(screen.getByText(en.settings.account.descSignedOut)).toBeInTheDocument();
  });

  it('A2 offline: both buttons disabled and described by the offline hint; A3 signing-in: the tapped button busy, the other disabled', async () => {
    const user = userEvent.setup();
    const { rerender } = await renderCard({ kind: 'signed-out' }, { online: false });
    const hint = screen.getByTestId('offline-hint');
    expect(apple()).toBeDisabled();
    expect(google()).toBeDisabled();
    expect(apple()).toHaveAttribute('aria-describedby', hint.id);
    expect(google()).toHaveAttribute('aria-describedby', hint.id);

    rerender(<AccountCard auth={{ kind: 'signed-out' }} online onSignIn={() => undefined} onSignOut={() => undefined} onDismissError={() => undefined} />);
    await user.click(google());
    rerender(<AccountCard auth={{ kind: 'signing-in' }} online onSignIn={() => undefined} onSignOut={() => undefined} onDismissError={() => undefined} />);
    const busy = screen.getByTestId('google-sign-in');
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(busy).toHaveTextContent(en.auth.signingIn);
    expect(apple()).toBeDisabled();
    expect(apple()).not.toHaveAttribute('aria-busy');
  });

  it('A4 on native: AUTH_FAILED uses the native wording; AUTH_CANCELLED keeps the shared one', async () => {
    await renderCard({ kind: 'signed-out', lastError: 'AUTH_FAILED' });
    expect(screen.getByRole('alert')).toHaveTextContent(en.errors.AUTH_FAILED_native);
    await next();
    await renderCard({ kind: 'signed-out', lastError: 'AUTH_CANCELLED' });
    expect(screen.getByRole('alert')).toHaveTextContent(en.errors.AUTH_CANCELLED);
    await next();
    await renderCard({ kind: 'signed-out', lastError: 'AUTH_FAILED' }, { platform: 'web' });
    expect(screen.getByRole('alert')).toHaveTextContent(en.errors.AUTH_FAILED);
  });
});

describe('A5 … A10 signed in / expired: provider line, Delete account block (M14-AC7, DESIGN S7)', () => {
  it('provider line: Google only / Apple only (relay address verbatim) / both', async () => {
    await renderCard(SIGNED_IN);
    expect(screen.getByTestId('account-provider')).toHaveTextContent(en.settings.account.provider);
    await next();
    await renderCard(APPLE_IN);
    expect(screen.getByTestId('account-provider')).toHaveTextContent(en.settings.account.providerApple);
    expect(screen.getByTestId('account-email')).toHaveTextContent('abc123@privaterelay.appleid.com');
    await next();
    await renderCard({ ...SIGNED_IN, providers: ['google', 'apple'] });
    expect(screen.getByTestId('account-provider')).toHaveTextContent(en.settings.account.providerBoth);
  });

  it('signed in + online: description, danger-ghost button enabled → onDeleteAccount; never hidden', async () => {
    const user = userEvent.setup();
    const { handlers } = await renderCard(SIGNED_IN, { platform: 'web' });
    const block = screen.getByTestId('delete-account-block');
    expect(within(block).getByText(en.settings.account.deleteDesc)).toBeInTheDocument();
    const btn = within(block).getByRole('button', { name: en.settings.account.delete });
    expect(btn).toHaveClass('danger-ghost');
    expect(btn).toBeEnabled();
    expect(btn).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByTestId('delete-account-reason')).toBeNull();
    await user.click(btn);
    expect(handlers.onDeleteAccount).toHaveBeenCalledTimes(1);
  });

  it('signed in + offline: button disabled with the always-visible offline reason attached', async () => {
    await renderCard(SIGNED_IN, { online: false });
    const btn = screen.getByTestId('delete-account');
    const reason = screen.getByTestId('delete-account-reason');
    expect(btn).toBeDisabled();
    expect(reason).toHaveTextContent(en.settings.account.deleteOffline);
    expect(btn).toHaveAttribute('aria-describedby', reason.id);
  });

  it('expired (A10): iOS shows Apple, Google, Sign out stacked; the delete button is disabled with the "sign in again first" reason', async () => {
    await renderCard({ kind: 'expired', email: 'minh.test@example.com' });
    const row = screen.getByTestId('apple-sign-in').closest('.btn-row');
    expect(row).toHaveClass('stack');
    const buttons = within(row as HTMLElement).getAllByRole('button').map((b) => b.textContent);
    expect(buttons).toEqual([en.auth.signInApple, en.auth.signInGoogle, en.settings.account.signOut]);
    const btn = screen.getByTestId('delete-account');
    expect(btn).toBeDisabled();
    expect(screen.getByTestId('delete-account-reason')).toHaveTextContent(en.settings.account.deleteExpired);
    expect(btn).toHaveAttribute('aria-describedby', screen.getByTestId('delete-account-reason').id);
  });

  it('signed out: no delete block at all', async () => {
    await renderCard({ kind: 'signed-out' });
    expect(screen.queryByTestId('delete-account-block')).toBeNull();
  });
});

describe('Apple revocation panel (A-62, DESIGN S7 panel)', () => {
  it('under the heading, title + body, link to Apple support (new tab, hidden "opens in Safari"), Dismiss → onDismissRevoke; not a live region', async () => {
    const user = userEvent.setup();
    const { handlers } = await renderCard({ kind: 'signed-out' }, { revokePanel: true });
    const panel = screen.getByTestId('apple-revoke-panel');
    expect(panel).not.toHaveAttribute('role');
    expect(panel).not.toHaveAttribute('aria-live');
    expect(within(panel).getByText(en.auth.delete.revokeTitle)).toBeInTheDocument();
    expect(within(panel).getByText(en.auth.delete.revokeBody)).toBeInTheDocument();
    const link = within(panel).getByRole('link');
    expect(link).toHaveAttribute('href', APPLE_REVOKE_HELP_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener');
    expect(link).toHaveTextContent(en.auth.delete.revokeLink);
    expect(link).toHaveTextContent(en.a11y.opensExternal);
    // Right under the h2, before the card body.
    const h2 = screen.getByRole('heading', { level: 2 });
    expect(h2.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(panel.compareDocumentPosition(screen.getByTestId('sign-in-buttons')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(within(panel).getByRole('button', { name: en.common.dismiss }));
    expect(handlers.onDismissRevoke).toHaveBeenCalledTimes(1);
  });

  it('vi: panel and every iOS state of the card scan clean (M14-AC11)', async () => {
    await renderCard({ kind: 'signed-out' }, { locale: 'vi', revokePanel: true });
    expect(scanVi()).toEqual([]);
    await next();
    await renderCard(APPLE_IN, { locale: 'vi', online: false });
    expect(scanVi()).toEqual([]);
    await next();
    await renderCard({ kind: 'expired', email: 'x@y.z' }, { locale: 'vi' });
    expect(scanVi()).toEqual([]);
    await next();
    await renderCard({ kind: 'signed-out', lastError: 'AUTH_FAILED' }, { locale: 'vi' });
    expect(scanVi()).toEqual([]);
  });
});
