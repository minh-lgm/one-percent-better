import { screen, waitFor } from '@testing-library/react';
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

describe('SignOutDialog — D4 (FR-41, M6-AC9, M6-AC11)', () => {
  it('opens with Keep selected and focused; confirm label "Sign out" (primary)', async () => {
    const { onConfirm } = await renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName(en.auth.signOut.title);
    expect(dialog).toHaveAccessibleDescription(en.auth.signOut.body);
    const keep = screen.getByRole('radio', { name: en.auth.signOut.keep });
    expect(keep).toBeChecked();
    expect(keep).toHaveFocus();
    expect(keep).toHaveAccessibleDescription(en.auth.signOut.keepDesc);
    expect(screen.getByRole('group', { name: en.auth.signOut.legend })).toBeInTheDocument();
    const confirm = screen.getByTestId('signout-confirm');
    expect(confirm).toHaveTextContent(en.auth.signOut.confirmKeep);
    expect(confirm).toHaveClass('primary');
    await userEvent.setup().click(confirm);
    expect(onConfirm).toHaveBeenCalledWith({ keepData: true });
  });

  it('arrow key → Remove: confirm turns danger "Sign out and remove data" and submits keepData=false', async () => {
    const user = userEvent.setup();
    const { onConfirm } = await renderDialog();
    await user.keyboard('{ArrowDown}');
    const remove = screen.getByRole('radio', { name: en.auth.signOut.remove });
    await waitFor(() => expect(remove).toBeChecked());
    expect(remove).toHaveAccessibleDescription(en.auth.signOut.removeDesc);
    const confirm = screen.getByTestId('signout-confirm');
    expect(confirm).toHaveTextContent(en.auth.signOut.confirmRemove);
    expect(confirm).toHaveClass('danger');
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith({ keepData: false });
  });

  it('Escape and Cancel call onCancel without confirming', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = await renderDialog();
    await user.keyboard('{Escape}');
    // jsdom does not fire `cancel` on Escape; simulate the native event.
    screen.getByRole('dialog').dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: en.common.cancel }));
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('busy: controls disabled, label "Signing out…", Escape ignored', async () => {
    const { onCancel } = await renderDialog('en', { busy: true });
    expect(screen.getByTestId('signout-confirm')).toBeDisabled();
    expect(screen.getByTestId('signout-confirm')).toHaveTextContent(en.auth.signOut.working);
    expect(screen.getByRole('button', { name: en.common.cancel })).toBeDisabled();
    expect(screen.getByRole('radio', { name: en.auth.signOut.keep })).toBeDisabled();
    screen.getByRole('dialog').dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('write failure: Alert errors.WRITE_FAILED inside the dialog', async () => {
    await renderDialog('en', { writeFailed: true });
    expect(screen.getByRole('alert')).toHaveTextContent(en.errors.WRITE_FAILED);
  });

  it('vi: no English leaks (Keep and Remove views)', async () => {
    const user = userEvent.setup();
    await renderDialog('vi');
    expect(screen.getByRole('dialog')).toHaveAccessibleName(vi.auth.signOut.title);
    expect(scanVi()).toEqual([]);
    await user.click(screen.getByRole('radio', { name: vi.auth.signOut.remove }));
    await waitFor(() => expect(screen.getByTestId('signout-confirm')).toHaveTextContent(vi.auth.signOut.confirmRemove));
    expect(scanVi()).toEqual([]);
  });
});
