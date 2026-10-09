import type { KvKey, KvRepository, Subscribable } from '../repositories';
import { fromLiveQuery, type AppDatabase } from './db';

export class DexieKvRepository implements KvRepository {
  constructor(private readonly db: AppDatabase) {}

  async get<T>(key: KvKey): Promise<T | undefined> {
    const row = await this.db.kv.get(key);
    return row?.value as T | undefined;
  }

  async set<T>(key: KvKey, value: T): Promise<void> {
    await this.db.kv.put({ key, value });
  }

  update<T>(key: KvKey, fn: (current: T | undefined) => T | undefined): Promise<{ previous: T | undefined; written: boolean }> {
    return this.db.transaction('rw', this.db.kv, async () => {
      const previous = (await this.db.kv.get(key))?.value as T | undefined;
      const next = fn(previous);
      if (next === undefined) return { previous, written: false };
      await this.db.kv.put({ key, value: next });
      return { previous, written: true };
    });
  }

  async delete(key: KvKey): Promise<void> {
    await this.db.kv.delete(key);
  }

  watch<T>(key: KvKey): Subscribable<T | undefined> {
    return fromLiveQuery(async () => (await this.db.kv.get(key))?.value as T | undefined);
  }
}
