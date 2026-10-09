import { AppDatabase } from '../data/dexie/db';

let n = 0;

/** A fresh, uniquely named database (fake-indexeddb is loaded by the test setup). */
export function createTestDatabase(): AppDatabase {
  return new AppDatabase(`test-db-${Date.now()}-${++n}-${Math.random().toString(36).slice(2)}`);
}
