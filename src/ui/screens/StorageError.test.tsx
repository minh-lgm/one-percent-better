// M12-AC6 (DESIGN 7.8.1 row 15): S9 on native has no "private window" / "reload the page" steps.
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';
import { createI18n } from '../../i18n/instance';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import { scanVi } from '../../test/render-with-locale';
import { StorageError } from './StorageError';

function renderError(locale: 'en' | 'vi', platform?: 'web' | 'ios') {
  const i18n = createI18n({ locale, strictMissingKeys: true });
  return render(
    <I18nextProvider i18n={i18n}>
      <StorageError onRetry={() => {}} platform={platform} />
    </I18nextProvider>,
  );
}

describe('StorageError', () => {
  it('web (default): browser copy', () => {
    renderError('en');
    expect(screen.getByRole('heading', { level: 1, name: en.storageError.title })).toBeInTheDocument();
    expect(screen.getByText(en.storageError.body)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([en.storageError.step1, en.storageError.step2, en.storageError.step3]);
    expect(screen.getByRole('button', { name: en.common.tryAgain })).toBeInTheDocument();
  });

  it('iOS: native copy, same title and button', () => {
    renderError('en', 'ios');
    expect(screen.getByRole('heading', { level: 1, name: en.storageError.title })).toBeInTheDocument();
    expect(screen.getByText(en.storageError.bodyNative)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([en.storageError.step1Native, en.storageError.step2Native, en.storageError.step3Native]);
    expect(screen.queryByText(en.storageError.body)).toBeNull();
    expect(screen.getByRole('button', { name: en.common.tryAgain })).toBeInTheDocument();
  });

  it('iOS in Vietnamese: no English leaks', () => {
    renderError('vi', 'ios');
    expect(screen.getByText(vi.storageError.bodyNative)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([vi.storageError.step1Native, vi.storageError.step2Native, vi.storageError.step3Native]);
    expect(scanVi()).toEqual([]);
  });
});
