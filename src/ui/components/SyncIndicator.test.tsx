import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi as vitest } from 'vitest';
import type { SyncStatus } from '../../domain/sync';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import type { AuthState } from '../../services/auth-service';
import type { TestContainer } from '../../test/container';
import { renderWithLocale, scanVi } from '../../test/render-with-locale';
import { indicatorState, SyncIndicator } from './SyncIndicator';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

const SIGNED_IN: AuthState = { kind: 'signed-in', userId: 'u1', email: 'minh.test@example.com', name: 'Minh Test' };
const idle = (extra: Partial<SyncStatus> = {}): SyncStatus => ({ kind: 'idle', pending: 0, lastSyncedAt: null, ...extra });

async function renderChip(auth: AuthState, status: SyncStatus | null, locale: 'en' | 'vi' = 'en', online = true) {
  const onRetry = vitest.fn();
  const r = await renderWithLocale(<SyncIndicator auth={auth} status={status} online={online} onRetry={onRetry} />, locale);
  tc = r.tc;
  return { ...r, onRetry };
}

describe('indicatorState (DESIGN §5 priority)', () => {
  it('expired > signing-in > error > offline/pending > syncing > synced; hidden when signed out', () => {
    expect(indicatorState({ kind: 'signed-out' }, idle(), true)).toBeNull();
    expect(indicatorState({ kind: 'unavailable' }, idle(), true)).toBeNull();
    expect(indicatorState({ kind: 'expired', email: 'x' }, idle({ kind: 'error', error: 'SYNC_UNREACHABLE' }), false)).toBe('expired');
    expect(indicatorState({ kind: 'signing-in' }, null, true)).toBe('signing-in');
    expect(indicatorState(SIGNED_IN, idle({ kind: 'error', error: 'SYNC_UNREACHABLE', pending: 2 }), true)).toBe('error');
    expect(indicatorState(SIGNED_IN, idle({ kind: 'error', error: 'SYNC_UNREACHABLE' }), false)).toBe('offline');
    expect(indicatorState(SIGNED_IN, idle({ kind: 'offline', error: 'SYNC_OFFLINE', pending: 1 }), true)).toBe('offline');
    expect(indicatorState(SIGNED_IN, idle({ kind: 'syncing', pending: 3 }), true)).toBe('syncing');
    expect(indicatorState(SIGNED_IN, idle({ pending: 3 }), true)).toBe('pending');
    expect(indicatorState(SIGNED_IN, idle(), true)).toBe('synced');
    expect(indicatorState(SIGNED_IN, null, true)).toBe('synced');
  });
});

describe('SyncIndicator (M7-AC15, FR-50)', () => {
  it('synced with a time today → "Synced 14:05"; without → "Synced"', async () => {
    await renderChip(SIGNED_IN, idle({ lastSyncedAt: '2026-10-09T07:05:00.000Z' }));
    expect(screen.getByTestId('sync-indicator')).toHaveTextContent('Synced 14:05');
    expect(screen.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'synced');
  });

  it('syncing, pending (1 and 3), offline (1, 3, none), error with Retry, expired link, signing-in', async () => {
    const user = userEvent.setup();
    const { rerender, onRetry } = await renderChip(SIGNED_IN, idle({ kind: 'syncing' }));
    const chip = () => screen.getByTestId('sync-indicator');
    expect(chip()).toHaveTextContent(en.sync.indicator.syncing);
    const re = (auth: AuthState, status: SyncStatus | null, online = true) => rerender(<SyncIndicator auth={auth} status={status} online={online} onRetry={onRetry} />);
    re(SIGNED_IN, idle({ pending: 1 }));
    expect(chip()).toHaveTextContent('1 change waiting to sync');
    re(SIGNED_IN, idle({ pending: 3 }));
    expect(chip()).toHaveTextContent('3 changes waiting to sync');
    re(SIGNED_IN, idle({ pending: 1 }), false);
    expect(chip()).toHaveTextContent('Offline · 1 change waiting');
    re(SIGNED_IN, idle({ pending: 3 }), false);
    expect(chip()).toHaveTextContent('Offline · 3 changes waiting');
    re(SIGNED_IN, idle(), false);
    expect(chip()).toHaveTextContent(en.sync.indicator.offlineNone);
    re(SIGNED_IN, idle({ kind: 'error', error: 'SYNC_UNREACHABLE', pending: 2 }));
    expect(chip()).toHaveTextContent(en.sync.indicator.error);
    const retry = screen.getByRole('button', { name: en.sync.indicator.retryAria });
    expect(retry).toHaveTextContent(en.sync.indicator.retry);
    await user.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
    re({ kind: 'expired', email: 'x' }, idle());
    const link = screen.getByRole('link', { name: en.sync.indicator.expired });
    expect(link).toHaveAttribute('href', '/settings');
    re({ kind: 'signing-in' }, null);
    expect(chip()).toHaveTextContent(en.sync.indicator.signingIn);
    re({ kind: 'signed-out' }, null);
    expect(screen.queryByTestId('sync-indicator')).toBeNull();
    expect(screen.getByTestId('sync-announce')).toBeInTheDocument();
  });

  it('live region: announces error/offline/expired and the return to synced (debounced, no repeats, nothing on first render or syncing)', async () => {
    const onRetry = vitest.fn();
    const r = await renderWithLocale(<SyncIndicator auth={SIGNED_IN} status={idle({ kind: 'error', error: 'SYNC_UNREACHABLE' })} online onRetry={onRetry} announceDebounceMs={20} />, 'en');
    tc = r.tc;
    const live = screen.getByTestId('sync-announce');
    expect(live).toHaveAttribute('role', 'status');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveAttribute('aria-atomic', 'true');
    const settle = () => new Promise((resolve) => setTimeout(resolve, 60));
    await settle();
    expect(live).toHaveTextContent(''); // first render is never announced
    const re = (auth: AuthState, status: SyncStatus, online = true) => r.rerender(<SyncIndicator auth={auth} status={status} online={online} onRetry={onRetry} announceDebounceMs={20} />);
    re(SIGNED_IN, idle({ kind: 'syncing' }));
    re(SIGNED_IN, idle({ kind: 'error', error: 'SYNC_UNREACHABLE' }));
    await waitFor(() => expect(live).toHaveTextContent(en.sync.announce.error));
    re(SIGNED_IN, idle({ kind: 'syncing' }));
    re(SIGNED_IN, idle());
    await waitFor(() => expect(live).toHaveTextContent(en.sync.announce.synced));
    re(SIGNED_IN, idle({ pending: 2 }));
    re(SIGNED_IN, idle());
    await settle();
    expect(live).toHaveTextContent(en.sync.announce.synced); // plain synced → pending → synced says nothing new
    re(SIGNED_IN, idle(), false);
    await waitFor(() => expect(live).toHaveTextContent(en.sync.announce.offline));
    // Flapping inside the debounce window: only the final state is announced.
    re(SIGNED_IN, idle(), true);
    re(SIGNED_IN, idle(), false);
    await settle();
    expect(live).toHaveTextContent(en.sync.announce.offline);
    re({ kind: 'expired', email: 'x' }, idle());
    await waitFor(() => expect(live).toHaveTextContent(en.sync.announce.expired));
  });

  it('vi: every state renders Vietnamese copy, no English leaks', async () => {
    const { rerender, onRetry } = await renderChip(SIGNED_IN, idle({ lastSyncedAt: '2026-10-08T02:30:00.000Z' }), 'vi');
    const states: Array<[AuthState, SyncStatus | null, boolean]> = [
      [SIGNED_IN, idle({ kind: 'syncing' }), true],
      [SIGNED_IN, idle({ pending: 1 }), true],
      [SIGNED_IN, idle({ pending: 3 }), true],
      [SIGNED_IN, idle({ pending: 3 }), false],
      [SIGNED_IN, idle(), false],
      [SIGNED_IN, idle({ kind: 'error', error: 'SYNC_UNREACHABLE' }), true],
      [{ kind: 'expired', email: 'x' }, idle(), true],
      [{ kind: 'signing-in' }, null, true],
    ];
    expect(screen.getByTestId('sync-indicator')).toHaveTextContent('Đã đồng bộ 08/10/2026');
    expect(scanVi()).toEqual([]);
    for (const [auth, status, online] of states) {
      rerender(<SyncIndicator auth={auth} status={status} online={online} onRetry={onRetry} />);
      expect(scanVi()).toEqual([]);
    }
    expect(screen.getByTestId('sync-indicator')).toHaveTextContent(vi.sync.indicator.signingIn);
  });
});
