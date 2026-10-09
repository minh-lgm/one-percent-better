import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type AppDatabase } from '../data/dexie/db';
import { DexieKvRepository } from '../data/dexie/kv-repo';
import { createTestDatabase } from '../test/db';
import { LocaleService } from './locale-service';

let db: AppDatabase;
let kv: DexieKvRepository;
let service: LocaleService;

beforeEach(async () => {
  db = createTestDatabase();
  await openDatabase(db);
  kv = new DexieKvRepository(db);
  service = new LocaleService(kv);
});

afterEach(async () => {
  await db.delete();
});

describe('LocaleService (M1-AC15, M1-AC16)', () => {
  it('detects from the browser when nothing is saved', async () => {
    expect(await service.resolve('vi-VN')).toBe('vi');
    expect(await service.resolve('en-US')).toBe('en');
    expect(await service.resolve(undefined)).toBe('en');
    expect(await kv.get('locale')).toBeUndefined(); // A-16: nothing written
  });

  it('a saved choice wins over the browser language', async () => {
    await kv.set('locale', 'en');
    expect(await service.resolve('vi-VN')).toBe('en');
  });

  it('an invalid saved value is ignored without error', async () => {
    await kv.set('locale', 'fr');
    expect(await service.resolve('vi-VN')).toBe('vi');
    await kv.set('locale', 42);
    expect(await service.resolve('en-US')).toBe('en');
  });

  it('set writes kv locale and watch emits it', async () => {
    const seen: Array<string | undefined> = [];
    const unsubscribe = service.watch().subscribe((v) => seen.push(v));
    await service.set('vi');
    expect(await kv.get('locale')).toBe('vi');
    await vi.waitFor(() => expect(seen).toContain('vi'));
    unsubscribe();
  });
});
