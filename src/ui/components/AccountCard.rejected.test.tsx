import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi as vitest } from 'vitest';
import type { SyncStatus } from '../../domain/sync';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import type { AuthState } from '../../services/auth-service';
import type { TestContainer } from '../../test/container';
import { USER1 } from '../../test/fake-auth-port';
import { renderWithLocale, scanVi } from '../../test/render-with-locale';
import { AccountCard } from './AccountCard';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

const SIGNED_IN: Extract<AuthState, { kind: 'signed-in' }> = { kind: 'signed-in', ...USER1 };
const idle = (patch: Partial<SyncStatus>): SyncStatus => ({ kind: 'idle', pending: 0, lastSyncedAt: '2026-10-09T07:05:00.000Z', ...patch });
const handlers = { onSignIn: vitest.fn(), onSignOut: vitest.fn(), onDismissError: vitest.fn(), onSyncNow: vitest.fn() };

async function renderCard(sync: SyncStatus, locale: 'en' | 'vi' = 'en') {
  const r = await renderWithLocale(<AccountCard auth={SIGNED_IN} online sync={sync} {...handlers} />, locale);
  tc = r.tc;
  return r;
}

// M7-P1: the info line tells "rows on this device the cloud refused" apart from "rows from the account skipped".
describe('AccountCard — wording for rows the cloud refused (M7-P1)', () => {
  it('rejected = 2 only: the local wording (export a backup), reason "local"', async () => {
    await renderCard(idle({ remoteInvalid: true, rejected: 2 }));
    const line = screen.getByTestId('remote-invalid');
    expect(line).toHaveAttribute('data-reason', 'local');
    expect(line).toHaveTextContent(en.settings.account.localRejected_other.replace('{{count}}', '2'));
    expect(line).not.toHaveTextContent(en.errors.SYNC_REMOTE_INVALID);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('rows from the account skipped only: the M7 wording, reason "remote"', async () => {
    await renderCard(idle({ remoteInvalid: true, remoteSkipped: true }));
    const line = screen.getByTestId('remote-invalid');
    expect(line).toHaveAttribute('data-reason', 'remote');
    expect(line).toHaveTextContent(en.errors.SYNC_REMOTE_INVALID);
  });

  it('both: both sentences, reason "both"; nothing when the cycle skipped nothing', async () => {
    const r = await renderCard(idle({ remoteInvalid: true, remoteSkipped: true, rejected: 1 }));
    const line = screen.getByTestId('remote-invalid');
    expect(line).toHaveAttribute('data-reason', 'both');
    expect(line).toHaveTextContent(en.settings.account.localRejected_one);
    expect(line).toHaveTextContent(en.errors.SYNC_REMOTE_INVALID);
    r.rerender(<AccountCard auth={SIGNED_IN} online sync={idle({})} {...handlers} />);
    expect(screen.queryByTestId('remote-invalid')).toBeNull();
  });

  it('vi: proposed string, no English leaks', async () => {
    await renderCard(idle({ remoteInvalid: true, rejected: 3 }), 'vi');
    expect(screen.getByTestId('remote-invalid')).toHaveTextContent(vi.settings.account.localRejected_other.replace('{{count}}', '3'));
    expect(scanVi()).toEqual([]);
  });
});
