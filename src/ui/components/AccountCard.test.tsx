import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi as vitest } from 'vitest';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import type { AuthState } from '../../services/auth-service';
import type { TestContainer } from '../../test/container';
import { renderWithLocale, scanVi } from '../../test/render-with-locale';
import { AccountCard } from './AccountCard';
import { initialOf } from './Avatar';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

const SIGNED_IN: AuthState = { kind: 'signed-in', userId: 'u1', email: 'minh.test@example.com', name: 'Minh Test' };

async function renderCard(auth: Exclude<AuthState, { kind: 'unavailable' }>, locale: 'en' | 'vi' = 'en', online = true) {
  const handlers = { onSignIn: vitest.fn(), onSignOut: vitest.fn(), onDismissError: vitest.fn() };
  const r = await renderWithLocale(<AccountCard auth={auth} online={online} {...handlers} />, locale);
  tc = r.tc;
  return { ...r, handlers };
}

describe('AccountCard (DESIGN S7 A1 … A5, A10)', () => {
  it('A1 signed-out: explanation, Google button, privacy note; click → onSignIn', async () => {
    const user = userEvent.setup();
    const { handlers } = await renderCard({ kind: 'signed-out' });
    expect(screen.getByRole('heading', { level: 2, name: en.settings.account.title })).toBeInTheDocument();
    expect(screen.getByText(en.settings.account.descSignedOut)).toBeInTheDocument();
    expect(screen.getByText(en.settings.account.privacyNote)).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: en.auth.signInGoogle });
    expect(btn).toBeEnabled();
    await user.click(btn);
    expect(handlers.onSignIn).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByTestId('offline-hint')).toBeNull();
    expect(document.querySelectorAll('img')).toHaveLength(0);
  });

  it('A2 offline: button disabled and described by the offline hint', async () => {
    await renderCard({ kind: 'signed-out' }, 'en', false);
    const btn = screen.getByRole('button', { name: en.auth.signInGoogle });
    expect(btn).toBeDisabled();
    const hint = screen.getByTestId('offline-hint');
    expect(hint).toHaveTextContent(en.settings.account.offlineHint);
    expect(btn).toHaveAttribute('aria-describedby', hint.id);
    expect(btn).toHaveAccessibleDescription(en.settings.account.offlineHint);
  });

  it('A3 signing-in: status line + busy Google button', async () => {
    await renderCard({ kind: 'signing-in' });
    expect(screen.getByRole('status')).toHaveTextContent(en.settings.account.signingInStatus);
    expect(screen.getByText(en.settings.account.signingInBody)).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: en.auth.signingIn });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });

  it('A4 error: Alert (role=alert) with the full message and Dismiss; button still usable', async () => {
    const user = userEvent.setup();
    const { handlers } = await renderCard({ kind: 'signed-out', lastError: 'AUTH_CANCELLED' });
    expect(screen.getByRole('alert')).toHaveTextContent(en.errors.AUTH_CANCELLED);
    expect(screen.getByRole('button', { name: en.auth.signInGoogle })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: en.common.dismiss }));
    expect(handlers.onDismissError).toHaveBeenCalledTimes(1);
  });

  it('A5 signed-in: avatar initial, name, email, provider, Sign out → onSignOut', async () => {
    const user = userEvent.setup();
    const { handlers } = await renderCard(SIGNED_IN);
    expect(screen.getByTestId('avatar')).toHaveTextContent('M');
    expect(screen.getByTestId('avatar')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('account-name')).toHaveTextContent('Minh Test');
    expect(screen.getByTestId('account-email')).toHaveTextContent('minh.test@example.com');
    expect(screen.getByText(en.settings.account.provider)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en.auth.signInGoogle })).toBeNull();
    await user.click(screen.getByRole('button', { name: en.settings.account.signOut }));
    expect(handlers.onSignOut).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('img')).toHaveLength(0);
  });

  it('A10 expired: info status with title, message, account line; Google + Sign out buttons', async () => {
    await renderCard({ kind: 'expired', email: 'minh.test@example.com' });
    const status = screen.getByTestId('auth-expired');
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toHaveTextContent(en.settings.account.expiredTitle);
    expect(status).toHaveTextContent(en.errors.AUTH_SESSION_EXPIRED);
    expect(status).toHaveTextContent('Account: minh.test@example.com');
    expect(screen.getByRole('button', { name: en.auth.signInGoogle })).toBeEnabled();
    expect(screen.getByRole('button', { name: en.settings.account.signOut })).toBeInTheDocument();
  });

  const STATES: Array<[string, Exclude<AuthState, { kind: 'unavailable' }>, boolean]> = [
    ['signed-out', { kind: 'signed-out' }, true],
    ['offline', { kind: 'signed-out' }, false],
    ['signing-in', { kind: 'signing-in' }, true],
    ['AUTH_CANCELLED', { kind: 'signed-out', lastError: 'AUTH_CANCELLED' }, true],
    ['AUTH_FAILED', { kind: 'signed-out', lastError: 'AUTH_FAILED' }, true],
    ['AUTH_OFFLINE', { kind: 'signed-out', lastError: 'AUTH_OFFLINE' }, false],
    ['signed-in', SIGNED_IN, true],
    ['expired', { kind: 'expired', email: 'minh.test@example.com' }, true],
  ];

  it.each(STATES)('vi: no English leaks in state %s (M6-AC11)', async (_name, auth, online) => {
    await renderCard(auth, 'vi', online);
    expect(screen.getByRole('heading', { level: 2, name: vi.settings.account.title })).toBeInTheDocument();
    expect(scanVi()).toEqual([]);
  });

  it('vi: the Google button label is the vi string, error alert is the vi string', async () => {
    await renderCard({ kind: 'signed-out', lastError: 'AUTH_FAILED' }, 'vi');
    expect(screen.getByRole('button', { name: vi.auth.signInGoogle })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(vi.errors.AUTH_FAILED);
  });
});

describe('initialOf (DESIGN 3.5, A-D29)', () => {
  it('first grapheme, upper-cased for the locale; falls back to email, then ?', () => {
    expect(initialOf('Minh Test', 'minh@example.com', 'en')).toBe('M');
    expect(initialOf('đức', 'x@y', 'vi')).toBe('Đ');
    expect(initialOf('ánh', 'x@y', 'vi')).toBe('Á');
    expect(initialOf('', 'nguyen@example.com', 'vi')).toBe('N');
    expect(initialOf('   ', '', 'en')).toBe('?');
    expect(initialOf('👩‍💻 Dev', 'x@y', 'en')).toBe('👩‍💻');
  });
});
