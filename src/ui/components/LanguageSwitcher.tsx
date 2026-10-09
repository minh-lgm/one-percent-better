import { useState } from 'react';
import type { Locale } from '../../i18n/types';
import { useServices } from '../hooks/useServices';
import { useT } from '../hooks/useT';
import { useToast } from '../hooks/useToast';
import { Alert } from './Alert';
import { SegmentedControl } from './SegmentedControl';

/** `English` / `Tiếng Việt` segmented control; applies immediately (FR-32). */
export function LanguageSwitcher({ describedBy }: { describedBy?: string }) {
  const { t, locale } = useT();
  const { locale: localeControl } = useServices();
  const toast = useToast();
  const [saveFailed, setSaveFailed] = useState(false);

  async function change(next: Locale) {
    if (next === locale) return;
    setSaveFailed(false);
    try {
      await localeControl.change(next);
      toast.show('toast.languageChanged');
    } catch {
      // The UI already switched (setLocale runs before persisting); tell the user it may not stick.
      setSaveFailed(true);
      toast.show('toast.languageChanged');
    }
  }

  return (
    <>
      <SegmentedControl<Locale>
        name="language"
        legend={t('settings.language.title')}
        legendHidden
        className="lang"
        describedBy={describedBy}
        value={locale}
        onChange={(v) => void change(v)}
        options={[
          { value: 'en', label: t('settings.language.option.en'), lang: 'en' },
          { value: 'vi', label: t('settings.language.option.vi'), lang: 'vi' },
        ]}
      />
      {saveFailed ? <Alert>{t('settings.language.saveFailed')}</Alert> : null}
    </>
  );
}
