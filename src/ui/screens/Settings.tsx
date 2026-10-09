import { useEffect, useState } from 'react';
import type { PersistState } from '../../integration/storage';
import { Badge, type BadgeTone } from '../components/Badge';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { PageHeader } from '../components/PageHeader';
import { useServices } from '../hooks/useServices';
import { useT } from '../hooks/useT';

const STORAGE_VIEW: Record<PersistState, { chip: 'settings.storage.protected' | 'settings.storage.notProtected' | 'settings.storage.unknown'; desc: 'settings.storage.protectedDesc' | 'settings.storage.notProtectedDesc' | 'settings.storage.unknownDesc'; tone: BadgeTone }> = {
  persisted: { chip: 'settings.storage.protected', desc: 'settings.storage.protectedDesc', tone: 'success' },
  'not-persisted': { chip: 'settings.storage.notProtected', desc: 'settings.storage.notProtectedDesc', tone: 'warning' },
  unsupported: { chip: 'settings.storage.unknown', desc: 'settings.storage.unknownDesc', tone: 'neutral' },
};

/** Settings (DESIGN S7). M1 cards: Language, Storage, About. */
export function Settings() {
  const { t } = useT();
  const { storagePersistence } = useServices();
  const [persist, setPersist] = useState<PersistState | null>(null);

  useEffect(() => {
    let active = true;
    void storagePersistence.then((s) => {
      if (active) setPersist(s);
    });
    return () => {
      active = false;
    };
  }, [storagePersistence]);

  const storage = persist ? STORAGE_VIEW[persist] : null;

  return (
    <>
      <PageHeader title={t('settings.title')} />
      <div className="sections">
        <section className="card" aria-labelledby="h-lang">
          <h2 id="h-lang">{t('settings.language.title')}</h2>
          <p className="desc" id="lang-desc">
            {t('settings.language.desc')}
          </p>
          <LanguageSwitcher describedBy="lang-desc" />
          <p className="hint">{t('settings.language.browserNote')}</p>
        </section>

        <section className="card" aria-labelledby="h-storage">
          <h2 id="h-storage">{t('settings.storage.title')}</h2>
          <div className="perm">
            <strong id="storage-label">{t('settings.storage.label')}</strong>
            {storage ? (
              <Badge tone={storage.tone} id="storage-value">
                {t(storage.chip)}
              </Badge>
            ) : null}
          </div>
          {storage ? <p className="hint">{t(storage.desc)}</p> : null}
        </section>

        <section className="card" aria-labelledby="h-about">
          <h2 id="h-about">{t('settings.about.title')}</h2>
          <p>
            <strong>{t('app.name')}</strong>
          </p>
          <p className="desc">{t('settings.about.desc')}</p>
        </section>
      </div>
    </>
  );
}
