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

// M7-D5 (QC M7 r2): rows the cloud refused (`dirty = 2`) exist only on this device; "Remove" must not
// claim "Your account keeps everything" and must warn that they will be lost.
describe('SignOutDialog — rows the cloud refused (M7-D5, M8 backlog fix)', () => {
  it('rejected = 2, pending = 0: warning block names the items, Remove description no longer says the account keeps everything, Remove adds the "will be lost" status note', async () => {
    const user = userEvent.setup();
    const { onConfirm } = await renderDialog('en', { rejected: 2, pending: 0 });
    const warning = screen.getByTestId('unsynced-warning');
    expect(warning).toHaveAttribute('data-rejected', '2');
    expect(screen.getByTestId('rejected-warning')).toHaveTextContent(en.auth.signOut.rejected_other.replace('{{count}}', '2'));
    expect(warning).toHaveTextContent(en.auth.signOut.rejectedKeep);
    expect(warning).not.toHaveTextContent('change');
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(new RegExp("2 items on this device couldn't be uploaded"));
    const removeRadio = screen.getByRole('radio', { name: en.auth.signOut.remove });
    expect(removeRadio).toHaveAccessibleDescription(en.auth.signOut.removeDescRejected);
    expect(screen.queryByText(en.auth.signOut.removeDesc)).toBeNull();
    const note = screen.getByTestId('unsynced-remove');
    expect(note).toHaveTextContent('');
    await user.click(removeRadio);
    expect(note).toHaveTextContent(en.auth.signOut.rejectedRemove);
    expect(note).not.toHaveTextContent(en.auth.signOut.unsyncedRemove);
    await user.click(screen.getByTestId('signout-confirm'));
    expect(onConfirm).toHaveBeenCalledWith({ keepData: false });
  });

  it('rejected = 1 and pending = 3: both facts in one block, both notes after choosing Remove', async () => {
    const user = userEvent.setup();
    await renderDialog('en', { rejected: 1, pending: 3, online: true });
    const warning = screen.getByTestId('unsynced-warning');
    expect(warning).toHaveTextContent(en.auth.signOut.unsynced_other.replace('{{count}}', '3'));
    expect(warning).toHaveTextContent(en.auth.signOut.unsyncedOnline);
    expect(warning).toHaveTextContent(en.auth.signOut.rejected_one);
    await user.click(screen.getByRole('radio', { name: en.auth.signOut.remove }));
    expect(screen.getByTestId('unsynced-remove')).toHaveTextContent(`${en.auth.signOut.unsyncedRemove} ${en.auth.signOut.rejectedRemove}`);
  });

  it('rejected = 0 and pending = 0: no warning block, the M6 Remove description', async () => {
    await renderDialog('en', { rejected: 0, pending: 0 });
    expect(screen.queryByTestId('unsynced-warning')).toBeNull();
    expect(screen.getByRole('radio', { name: en.auth.signOut.remove })).toHaveAccessibleDescription(en.auth.signOut.removeDesc);
  });

  it('vi: proposed strings, no English leaks', async () => {
    const user = userEvent.setup();
    await renderDialog('vi', { rejected: 2, pending: 0 });
    expect(screen.getByTestId('rejected-warning')).toHaveTextContent(vi.auth.signOut.rejected_other.replace('{{count}}', '2'));
    await user.click(screen.getByRole('radio', { name: vi.auth.signOut.remove }));
    expect(screen.getByTestId('unsynced-remove')).toHaveTextContent(vi.auth.signOut.rejectedRemove);
    expect(scanVi()).toEqual([]);
  });
});
