import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi as vitest } from 'vitest';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import type { TestContainer } from '../../test/container';
import { renderWithLocale, scanVi } from '../../test/render-with-locale';
import { SignOutDialog } from './SignOutDialog';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

async function renderDialog(locale: 'en' | 'vi' = 'en', props: Partial<React.ComponentProps<typeof SignOutDialog>> = {}) {
  const onConfirm = vitest.fn();
  const onCancel = vitest.fn();
  const r = await renderWithLocale(<SignOutDialog open onConfirm={onConfirm} onCancel={onCancel} {...props} />, locale);
  tc = r.tc;
  return { ...r, onConfirm, onCancel };
}

describe('SignOutDialog — M7 unsynced warning, Remove anyway (FR-41, M7-AC12, M7-AC15)', () => {
  it('pending > 0 online: warning block (count + online line) is part of the description; Remove adds the status note', async () => {
    const user = userEvent.setup();
    const { onConfirm } = await renderDialog('en', { pending: 2, online: true });
    const warning = screen.getByTestId('unsynced-warning');
    expect(warning).toHaveTextContent(en.auth.signOut.unsynced_other.replace('{{count}}', '2'));
    expect(warning).toHaveTextContent(en.auth.signOut.unsyncedOnline);
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(new RegExp('2 changes haven'));
    const note = screen.getByTestId('unsynced-remove');
    expect(note).toHaveAttribute('role', 'status');
    expect(note).toHaveTextContent('');
    await user.click(screen.getByRole('radio', { name: en.auth.signOut.remove }));
    expect(note).toHaveTextContent(en.auth.signOut.unsyncedRemove);
    await user.click(screen.getByTestId('signout-confirm'));
    expect(onConfirm).toHaveBeenCalledWith({ keepData: false });
  });

  it('pending = 1 offline: singular line + offline explanation; pending = 0: no block', async () => {
    const { rerender, onConfirm, onCancel } = await renderDialog('en', { pending: 1, online: false });
    expect(screen.getByTestId('unsynced-warning')).toHaveTextContent(en.auth.signOut.unsynced_one);
    expect(screen.getByTestId('unsynced-warning')).toHaveTextContent(en.auth.signOut.unsyncedOffline);
    rerender(<SignOutDialog open pending={0} onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.queryByTestId('unsynced-warning')).toBeNull();
  });

  it('syncFailed with Remove selected: Alert + "Remove anyway"; confirm again submits removeAnyway; Keep is unaffected', async () => {
    const user = userEvent.setup();
    const { onConfirm } = await renderDialog('en', { pending: 2, syncFailed: true });
    expect(screen.getByRole('alert')).toHaveTextContent(en.auth.signOut.syncFailed);
    expect(screen.getByTestId('signout-confirm')).toHaveTextContent(en.auth.signOut.confirmKeep);
    await user.click(screen.getByRole('radio', { name: en.auth.signOut.remove }));
    expect(screen.getByTestId('signout-confirm')).toHaveTextContent(en.auth.signOut.removeAnyway);
    expect(screen.getByTestId('signout-confirm')).toHaveClass('danger');
    await user.click(screen.getByTestId('signout-confirm'));
    expect(onConfirm).toHaveBeenCalledWith({ keepData: false, removeAnyway: true });
  });

  it('vi: warning (offline), remove note and Remove anyway have no English leaks', async () => {
    const user = userEvent.setup();
    await renderDialog('vi', { pending: 3, online: false, syncFailed: true });
    expect(screen.getByTestId('unsynced-warning')).toHaveTextContent(vi.auth.signOut.unsynced_other.replace('{{count}}', '3'));
    await user.click(screen.getByRole('radio', { name: vi.auth.signOut.remove }));
    expect(screen.getByTestId('unsynced-remove')).toHaveTextContent(vi.auth.signOut.unsyncedRemove);
    expect(screen.getByTestId('signout-confirm')).toHaveTextContent(vi.auth.signOut.removeAnyway);
    expect(scanVi()).toEqual([]);
  });
});
