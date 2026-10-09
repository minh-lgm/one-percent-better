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

  async delete(key: KvKey): Promise<void> {
    await this.db.kv.delete(key);
  }

  watch<T>(key: KvKey): Subscribable<T | undefined> {
    return fromLiveQuery(async () => (await this.db.kv.get(key))?.value as T | undefined);
  }
}
