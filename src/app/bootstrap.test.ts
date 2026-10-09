// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StorageError } from '../domain/types';
import { createI18n } from '../i18n/instance';
import { createTestContainer, type TestContainer } from '../test/container';
import { bootstrap } from './bootstrap';
import { createContainer } from './container';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

describe('bootstrap (ARCH §5.8)', () => {
  it('applies the saved locale before rendering (saved wins over browser)', async () => {
    tc = await createTestContainer({ locale: 'en' });
    await tc.container.localeService.set('en');
    const result = await bootstrap({ navigatorLanguage: 'vi-VN', createContainer: async () => tc!.container, i18n: tc.i18n });
    expect(result.ok).toBe(true);
    expect(tc.i18n.language).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('detects from the browser when nothing is saved and writes nothing (A-16)', async () => {
    tc = await createTestContainer({ locale: 'en' });
    const result = await bootstrap({ navigatorLanguage: 'vi-VN', createContainer: async () => tc!.container, i18n: tc.i18n });
    expect(result.ok).toBe(true);
    expect(tc.i18n.language).toBe('vi');
    expect(await tc.container.db.kv.get('locale')).toBeUndefined();
  });

  it('reports a StorageError with the detected locale when the DB cannot open', async () => {
    const i18n = createI18n({ locale: 'en' });
    const result = await bootstrap({
      navigatorLanguage: 'vi-VN',
      i18n,
      createContainer: async () => {
        throw new StorageError('nope');
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(StorageError);
      expect(result.detectedLocale).toBe('vi');
      expect(i18n.language).toBe('vi');
    }
  });

  it('wraps unexpected startup failures in StorageError', async () => {
    const result = await bootstrap({ navigatorLanguage: 'en', createContainer: async () => { throw new Error('x'); } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(StorageError);
  });
});

describe('createContainer', () => {
  it('requests persistent storage exactly once (M1-AC10)', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    const i18n = createI18n({ locale: 'en' });
    const container = await createContainer({ i18n, dbName: `boot-${Date.now()}`, storage: { persist } });
    expect(await container.storagePersistence).toBe('persisted');
    expect(persist).toHaveBeenCalledTimes(1);
    await container.db.delete();
  });

  it('throws StorageError when IndexedDB is unavailable', async () => {
    const i18n = createI18n({ locale: 'en' });
    await expect(createContainer({ i18n, dbName: 'x', indexedDbAvailable: false, storage: undefined })).rejects.toBeInstanceOf(StorageError);
  });

  it('locale.change applies immediately and persists (M1-AC16)', async () => {
    tc = await createTestContainer({ locale: 'en' });
    await tc.container.locale.change('vi');
    expect(tc.container.locale.current()).toBe('vi');
    expect(tc.i18n.t('nav.today')).toBe('Hôm nay');
    expect(await tc.container.db.kv.get('locale')).toEqual({ key: 'locale', value: 'vi' });
  });
});
