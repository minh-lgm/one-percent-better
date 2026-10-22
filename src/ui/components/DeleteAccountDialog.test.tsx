// D6 — DeleteAccountDialog (DESIGN S7 D6, 8.3; M14-AC7, M14-AC11): default choice, initial focus, busy state,
// error state, keyboard, en + vi.
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi as vitest } from 'vitest';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import type { TestContainer } from '../../test/container';
import { renderWithLocale, scanVi } from '../../test/render-with-locale';
import { DeleteAccountDialog } from './DeleteAccountDialog';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

const EMAIL = 'minh.test@example.com';

async function renderDialog(locale: 'en' | 'vi' = 'en', props: Partial<React.ComponentProps<typeof DeleteAccountDialog>> = {}) {
  const onConfirm = vitest.fn();
  const onCancel = vitest.fn();
  const r = await renderWithLocale(<DeleteAccountDialog open email={EMAIL} onConfirm={onConfirm} onCancel={onCancel} {...props} />, locale);
  tc = r.tc;
  return { ...r, onConfirm, onCancel, dialog: screen.getByTestId('delete-account-dialog') as HTMLDialogElement };
}

describe('DeleteAccountDialog — D6', () => {
  it('opens as a modal with the DESIGN copy, email verbatim, Remove selected by default, focus on Cancel, Tab order radios → confirm → cancel', async () => {
    const user = userEvent.setup();
    const { dialog } = await renderDialog();
    expect(dialog.open).toBe(true);
    expect(dialog).toHaveAttribute('aria-labelledby');
    expect(screen.getByRole('heading', { level: 2, name: en.auth.delete.title })).toBeInTheDocument();
    expect(screen.getByText(en.auth.delete.body)).toBeInTheDocument();
    expect(screen.getByTestId('delete-account-email')).toHaveTextContent(`Account: ${EMAIL}`);
    expect(screen.getByText(en.auth.delete.legend)).toBeInTheDocument();
    const remove = screen.getByRole('radio', { name: en.auth.delete.remove });
    const keep = screen.getByRole('radio', { name: en.auth.delete.keep });
    expect(remove).toBeChecked();
    expect(keep).not.toBeChecked();
    expect(remove).toHaveAccessibleDescription(en.auth.delete.removeDesc);
    expect(keep).toHaveAccessibleDescription(en.auth.delete.keepDesc);
    const confirm = screen.getByTestId('delete-account-confirm');
    expect(confirm).toHaveTextContent(en.auth.delete.confirm);
    expect(confirm).toHaveClass('danger');
    const cancel = screen.getByRole('button', { name: en.common.cancel });
    expect(document.activeElement).toBe(cancel);
    expect(screen.queryByTestId('delete-apple-note')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    // Order in the DOM: Remove, Keep, Delete account, Cancel.
    const order = [remove, keep, confirm, cancel];
    for (let i = 0; i < order.length - 1; i += 1) expect(order[i].compareDocumentPosition(order[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Keyboard: arrow keys move the choice, the confirm button is still the destructive one.
    remove.focus();
    await user.keyboard('{ArrowDown}');
    expect(keep).toBeChecked();
    expect(confirm).toHaveClass('danger');
    await user.keyboard('{ArrowUp}');
    expect(remove).toBeChecked();
  });

  it('confirm with the default → onConfirm({ keepData: false }); Keep → { keepData: true }; Cancel / Esc → onCancel', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel, dialog } = await renderDialog();
    await user.click(screen.getByTestId('delete-account-confirm'));
    expect(onConfirm).toHaveBeenLastCalledWith({ keepData: false });
    await user.click(screen.getByRole('radio', { name: en.auth.delete.keep }));
    await user.click(screen.getByTestId('delete-account-confirm'));
    expect(onConfirm).toHaveBeenLastCalledWith({ keepData: true });
    await user.click(screen.getByRole('button', { name: en.common.cancel }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(onCancel).toHaveBeenCalledTimes(2);
    // Backdrop click = Cancel.
    fireEvent.click(dialog);
    expect(onCancel).toHaveBeenCalledTimes(3);
  });

  it('appleNote: the info block is shown and referenced by aria-describedby (iOS + Apple identity only)', async () => {
    const { dialog } = await renderDialog('en', { appleNote: true });
    const note = screen.getByTestId('delete-apple-note');
    expect(note).toHaveTextContent(en.auth.delete.appleNote);
    expect(dialog.getAttribute('aria-describedby')?.split(' ')).toContain(note.id);
    // Above the legend.
    expect(note.compareDocumentPosition(screen.getByText(en.auth.delete.legend)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('busy: aria-busy on the dialog, confirm "Deleting…" aria-disabled (not disabled, keeps focus), Cancel + radios disabled, Esc/backdrop ignored, status text announced; a second submit does nothing', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel, dialog, rerender } = await renderDialog();
    const confirm = screen.getByTestId('delete-account-confirm');
    confirm.focus();
    rerender(<DeleteAccountDialog open email={EMAIL} busy onConfirm={onConfirm} onCancel={onCancel} />);
    expect(dialog).toHaveAttribute('aria-busy', 'true');
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    expect(confirm).not.toBeDisabled();
    expect(confirm).toHaveTextContent(en.auth.delete.working);
    expect(document.activeElement).toBe(confirm);
    expect(screen.getByRole('button', { name: en.common.cancel })).toBeDisabled();
    expect(screen.getByRole('radio', { name: en.auth.delete.remove })).toBeDisabled();
    expect(screen.getByRole('radio', { name: en.auth.delete.keep })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(en.auth.delete.workingStatus);
    expect(screen.getByRole('status')).toHaveClass('delete-status'); // neutral muted text, not the danger box (M14-D5)
    expect(screen.getByRole('status')).not.toHaveClass('remove-note');
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    fireEvent.click(dialog);
    expect(onCancel).not.toHaveBeenCalled();
    await user.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
    // The status region is always in the DOM and empty when idle.
    rerender(<DeleteAccountDialog open email={EMAIL} onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(screen.getByRole('status')).toHaveClass('sr-only');
  });

  it.each(['ACCOUNT_DELETE_OFFLINE', 'ACCOUNT_DELETE_CANCELLED', 'ACCOUNT_DELETE_FAILED', 'ACCOUNT_DELETE_SESSION_EXPIRED'] as const)('error %s: Alert role=alert above the buttons with the DESIGN text, dialog stays open, confirm usable and focused', async (code) => {
    const { onConfirm, onCancel, dialog, rerender } = await renderDialog();
    rerender(<DeleteAccountDialog open email={EMAIL} error={code} onConfirm={onConfirm} onCancel={onCancel} />);
    expect(dialog.open).toBe(true);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(en.errors[code]);
    const confirm = screen.getByTestId('delete-account-confirm');
    expect(alert.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(confirm).toBeEnabled();
    expect(confirm).not.toHaveAttribute('aria-disabled');
    await act(async () => undefined);
    expect(document.activeElement).toBe(confirm);
    expect(screen.getByRole('radio', { name: en.auth.delete.remove })).toBeEnabled();
  });

  it('closed → not open; reopening resets the choice to Remove and focuses Cancel again', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel, dialog, rerender } = await renderDialog();
    await user.click(screen.getByRole('radio', { name: en.auth.delete.keep }));
    rerender(<DeleteAccountDialog open={false} email={EMAIL} onConfirm={onConfirm} onCancel={onCancel} />);
    expect(dialog.open).toBe(false);
    rerender(<DeleteAccountDialog open email={EMAIL} onConfirm={onConfirm} onCancel={onCancel} />);
    expect(dialog.open).toBe(true);
    expect(screen.getByRole('radio', { name: en.auth.delete.remove })).toBeChecked();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: en.common.cancel }));
  });

  it('vi: every state scans clean and shows the vi copy (M14-AC11)', async () => {
    const { onConfirm, onCancel, rerender } = await renderDialog('vi', { appleNote: true });
    expect(screen.getByRole('heading', { level: 2, name: vi.auth.delete.title })).toBeInTheDocument();
    expect(screen.getByText(vi.auth.delete.appleNote)).toBeInTheDocument();
    expect(screen.getByTestId('delete-account-email')).toHaveTextContent(`Tài khoản: ${EMAIL}`);
    expect(scanVi()).toEqual([]);
    rerender(<DeleteAccountDialog open email={EMAIL} busy appleNote onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByTestId('delete-account-confirm')).toHaveTextContent(vi.auth.delete.working);
    expect(scanVi()).toEqual([]);
    for (const code of ['ACCOUNT_DELETE_OFFLINE', 'ACCOUNT_DELETE_CANCELLED', 'ACCOUNT_DELETE_FAILED', 'ACCOUNT_DELETE_SESSION_EXPIRED'] as const) {
      rerender(<DeleteAccountDialog open email={EMAIL} error={code} onConfirm={onConfirm} onCancel={onCancel} />);
      expect(within(screen.getByRole('alert')).getByText(vi.errors[code])).toBeInTheDocument();
      expect(scanVi()).toEqual([]);
    }
  });
});
