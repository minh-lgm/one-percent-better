import { describe, expect, it } from 'vitest';
import { Mutex } from './mutex';

describe('Mutex (M2-D3)', () => {
  it('runs tasks one after another in call order, even when one rejects', async () => {
    const m = new Mutex();
    const log: string[] = [];
    const task = (name: string, ms: number, fail = false) => () =>
      new Promise<string>((resolve, reject) =>
        setTimeout(() => {
          log.push(name);
          if (fail) reject(new Error(name));
          else resolve(name);
        }, ms),
      );
    const results = await Promise.allSettled([m.run(task('a', 30)), m.run(task('b', 5, true)), m.run(task('c', 1))]);
    expect(log).toEqual(['a', 'b', 'c']);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
    expect(await m.run(async () => 'd')).toBe('d');
  });
});
