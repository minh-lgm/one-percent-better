import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi as vitest } from 'vitest';
import type { SyncStatus } from '../../domain/sync';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import type { AuthState } from '../../services/auth-service';
import type { TestContainer } from '../../test/container';
import { renderWithLocale, scanVi } from '../../test/render-with-locale';
import { AccountCard } from './AccountCard';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

const SIGNED_IN: Exclude<AuthState, { kind: 'unavailable' }> = { kind: 'signed-in', userId: 'u1', email: 'minh.test@example.com', name: 'Minh Test' };
const idle = (extra: Partial<SyncStatus> = {}): SyncStatus => ({ kind: 'idle', pending: 0, lastSyncedAt: null, ...extra });

async function renderSynced(sync: SyncStatus | null, locale: 'en' | 'vi' = 'en', online = true) {
  const handlers = { onSignIn: vitest.fn(), onSignOut: vitest.fn(), onDismissError: vitest.fn(), onSyncNow: vitest.fn() };
  const r = await renderWithLocale(<AccountCard auth={SIGNED_IN} online={online} sync={sync} {...handlers} />, locale);
  tc = r.tc;
  return { ...r, handlers };
}

describe('AccountCard — M7 sync details (DESIGN A5 … A9, M7-AC15)', () => {
  it('A5: Last synced "today at 14:05", Waiting 0 changes, info line, Sync now + Sign out', async () => {
    const user = userEvent.setup();
    const { handlers } = await renderSynced(idle({ lastSyncedAt: '2026-10-09T07:05:00.000Z' }));
    expect(screen.getByTestId('last-synced')).toHaveTextContent('today at 14:05');
    expect(screen.getByTestId('pending-count')).toHaveTextContent('0 changes');
    expect(screen.getByText(en.settings.account.syncedInfo)).toBeInTheDocument();
    const syncNow = screen.getByRole('button', { name: en.settings.account.syncNow });
    expect(syncNow).toBeEnabled();
    await user.click(syncNow);
    expect(handlers.onSyncNow).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: en.settings.account.signOut })).toBeInTheDocument();
    expect(screen.queryByTestId('sync-error')).toBeNull();
    expect(screen.queryByTestId('remote-invalid')).toBeNull();
  });

  it('never synced yet → "Not yet"; another day → "2026-10-08 at 09:30"', async () => {
    const { rerender, handlers } = await renderSynced(idle());
    expect(screen.getByTestId('last-synced')).toHaveTextContent(en.settings.account.neverSynced);
    rerender(<AccountCard auth={SIGNED_IN} online sync={idle({ lastSyncedAt: '2026-10-08T02:30:00.000Z' })} {...handlers} />);
    expect(screen.getByTestId('last-synced')).toHaveTextContent('2026-10-08 at 09:30');
  });

  it('A6 syncing: Sync now aria-disabled with the label "Syncing…" and the click is ignored', async () => {
    const user = userEvent.setup();
    const { handlers } = await renderSynced(idle({ kind: 'syncing' }));
    const btn = screen.getByRole('button', { name: en.sync.indicator.syncing });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    await user.click(btn);
    expect(handlers.onSyncNow).not.toHaveBeenCalled();
  });

  it('A7 pending (online): "3 changes"; offline: Sync now disabled + described by the offline line', async () => {
    const { rerender, handlers } = await renderSynced(idle({ pending: 3 }));
    expect(screen.getByTestId('pending-count')).toHaveTextContent('3 changes');
    rerender(<AccountCard auth={SIGNED_IN} online={false} sync={idle({ pending: 1 })} {...handlers} />);
    expect(screen.getByTestId('pending-count')).toHaveTextContent('1 change');
    const btn = screen.getByRole('button', { name: en.settings.account.syncNow });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAccessibleDescription(en.settings.account.offlineSync);
  });

  it('A8 error: Alert errors.SYNC_UNREACHABLE + "Trying again at HH:MM."; Sync now stays usable', async () => {
    await renderSynced(idle({ kind: 'error', error: 'SYNC_UNREACHABLE', nextRetryAt: '2026-10-09T03:05:30.000Z', pending: 2 }));
    expect(screen.getByRole('alert')).toHaveTextContent(en.errors.SYNC_UNREACHABLE);
    expect(screen.getByTestId('next-retry')).toHaveTextContent(en.settings.account.nextRetry.replace('{{time}}', '10:05'));
    expect(screen.getByRole('button', { name: en.settings.account.syncNow })).toBeEnabled();
  });

  it('A9 remoteInvalid: info line errors.SYNC_REMOTE_INVALID, no alert', async () => {
    await renderSynced(idle({ remoteInvalid: true, lastSyncedAt: '2026-10-09T07:05:00.000Z' }));
    expect(screen.getByTestId('remote-invalid')).toHaveTextContent(en.errors.SYNC_REMOTE_INVALID);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('vi: A5, A7 (offline), A8, A9 have no English leaks', async () => {
    const { rerender, handlers } = await renderSynced(idle({ lastSyncedAt: '2026-10-09T07:05:00.000Z' }), 'vi');
    expect(screen.getByTestId('last-synced')).toHaveTextContent('hôm nay lúc 14:05');
    expect(scanVi()).toEqual([]);
    rerender(<AccountCard auth={SIGNED_IN} online={false} sync={idle({ pending: 3 })} {...handlers} />);
    expect(screen.getByTestId('pending-count')).toHaveTextContent('3 thay đổi');
    expect(scanVi()).toEqual([]);
    rerender(<AccountCard auth={SIGNED_IN} online sync={idle({ kind: 'error', error: 'SYNC_UNREACHABLE', nextRetryAt: '2026-10-09T03:05:30.000Z' })} {...handlers} />);
    expect(screen.getByText(vi.errors.SYNC_UNREACHABLE)).toBeInTheDocument();
    expect(scanVi()).toEqual([]);
    rerender(<AccountCard auth={SIGNED_IN} online sync={idle({ remoteInvalid: true })} {...handlers} />);
    expect(scanVi()).toEqual([]);
  });
});
