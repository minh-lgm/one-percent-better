import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi as vitest } from 'vitest';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import type { TestContainer } from '../../test/container';
import { renderWithLocale, scanVi } from '../../test/render-with-locale';
import { MergeAccountDialog } from './MergeAccountDialog';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

async function renderDialog(locale: 'en' | 'vi' = 'en', props: Partial<React.ComponentProps<typeof MergeAccountDialog>> = {}) {
  const onConfirm = vitest.fn();
  const onCancel = vitest.fn();
  const r = await renderWithLocale(<MergeAccountDialog open goals={6} entries={25} email="other.user@example.com" onConfirm={onConfirm} onCancel={onCancel} {...props} />, locale);
  tc = r.tc;
  return { ...r, onConfirm, onCancel };
}

describe('MergeAccountDialog — D5 (FR-47, M7-AC7, M7-AC15)', () => {
  it('title, body with counts and email, note; Cancel focused first; buttons call the handlers', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = await renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName(en.auth.merge.title);
    expect(dialog).toHaveAccessibleDescription("This device still has 6 goals, 25 entries from another account. If you continue, they'll be added to the account other.user@example.com, next to what's already there.");
    expect(screen.getByText(en.auth.merge.note)).toBeInTheDocument();
    const cancel = screen.getByRole('button', { name: en.common.cancel });
    expect(cancel).toHaveFocus();
    await user.click(screen.getByRole('button', { name: en.auth.merge.confirm }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.click(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('singular counts and busy state', async () => {
    const { onCancel } = await renderDialog('en', { goals: 1, entries: 1, busy: true });
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(/1 goal, 1 entry/);
    expect(screen.getByTestId('merge-confirm')).toBeDisabled();
    expect(screen.getByTestId('merge-confirm')).toHaveTextContent(en.auth.merge.working);
    expect(screen.getByRole('button', { name: en.common.cancel })).toBeDisabled();
    screen.getByRole('dialog').dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('vi: no English leaks', async () => {
    await renderDialog('vi');
    expect(screen.getByRole('dialog')).toHaveAccessibleName(vi.auth.merge.title);
    expect(screen.getByRole('button', { name: vi.auth.merge.confirm })).toBeInTheDocument();
    expect(scanVi()).toEqual([]);
  });
});
