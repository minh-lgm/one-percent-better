// QC round 2 (M2): the mutex added for M2-D3 must serialise, keep order, and never hang after a failure.
import { describe, expect, it, vi } from 'vitest';
import { Mutex } from '../../src/services/mutex';
import { createTestContainer } from '../../src/test/container';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('M2-D3 Mutex', () => {
  it('runs tasks one at a time in call order, never overlapping', async () => {
    const m = new Mutex();
    const log: string[] = [];
    let running = 0;
    let maxRunning = 0;
    const task = (name: string, ms: number) => async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      log.push(`start ${name}`);
      await sleep(ms);
      log.push(`end ${name}`);
      running--;
      return name;
    };
    const res = await Promise.all([m.run(task('a', 30)), m.run(task('b', 1)), m.run(task('c', 10))]);
    expect(res).toEqual(['a', 'b', 'c']);
    expect(maxRunning).toBe(1);
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });
  it('a rejected task rejects only its own caller and does not block or poison later tasks', async () => {
    const m = new Mutex();
    const boom = m.run(async () => {
      await sleep(5);
      throw new Error('boom');
    });
    const after = m.run(async () => 'after');
    await expect(boom).rejects.toThrow('boom');
    await expect(after).resolves.toBe('after');
    await expect(m.run(async () => 'again')).resolves.toBe('again');
  });
  it('a task that throws synchronously (not async) also leaves the mutex usable', async () => {
    const m = new Mutex();
    const bad = m.run((() => {
      throw new Error('sync');
    }) as () => Promise<never>);
    await expect(bad).rejects.toThrow('sync');
    await expect(m.run(async () => 1)).resolves.toBe(1);
  });
  it('many (200) queued tasks all complete, in order, without stack growth', async () => {
    const m = new Mutex();
    const out: number[] = [];
    await Promise.all(Array.from({ length: 200 }, (_, i) => m.run(async () => void out.push(i))));
    expect(out).toEqual(Array.from({ length: 200 }, (_, i) => i));
  });
});

async function setup() {
  const tc = await createTestContainer({ permission: 'granted' });
  const { goalService, settingsService, timerService, reminderService, entryService } = tc.container;
  const now = new Date('2026-10-09T10:00:00+07:00');
  let seq = 0;
  const mk = async (name: string) => {
    const r = await goalService.create({ name, why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, new Date(now.getTime() + ++seq * 1000));
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    return r.value;
  };
  return { tc, mk, now, settingsService, timerService, reminderService, entryService };
}

describe('M2-D3 services after a failure in the middle of a locked section', () => {
  it('TimerService.save: entries.add throwing once rejects that call, keeps the timer, and later start/save/discard still work', async () => {
    const { tc, mk, now, timerService, entryService } = await setup();
    const a = await mk('A');
    await timerService.start(a.id, now);
    const later = new Date(now.getTime() + 25 * 60_000);
    const spy = vi.spyOn(entryService, 'add').mockRejectedValueOnce(new Error('disk full'));
    const [failing, queued] = await Promise.allSettled([timerService.save({ minutes: 25, note: '' }, later), timerService.save({ minutes: 25, note: 'second' }, later)]);
    expect(failing.status).toBe('rejected');
    expect(queued.status).toBe('fulfilled'); // the queued call is not stuck behind the failure
    expect(queued.status === 'fulfilled' && queued.value.ok).toBe(true);
    expect(await tc.container.db.entries.where('goalId').equals(a.id).count()).toBe(1);
    expect(await timerService.current()).toBeUndefined();
    spy.mockRestore();
    expect((await timerService.start(a.id, later)).ok).toBe(true);
    expect((await timerService.discard()).ok).toBe(true);
    expect((await timerService.discard()).ok).toBe(false); // TIMER_NOT_RUNNING, not a hang
    await tc.dispose();
  });
  it('TimerService.start: goal lookup throwing once does not hang the next start', async () => {
    const { tc, mk, now, timerService } = await setup();
    const a = await mk('A');
    const spy = vi.spyOn(tc.container.db.goals, 'get').mockRejectedValueOnce(new Error('idb') as never);
    const r = await Promise.allSettled([timerService.start(a.id, now), timerService.start(a.id, now)]);
    expect(r[0].status).toBe('rejected');
    expect(r[1].status).toBe('fulfilled');
    spy.mockRestore();
    await tc.dispose();
  });
  it('ReminderService.check: notifications.show throwing once rejects that call; the next check (same day) still sends once', async () => {
    const { tc, mk, settingsService, reminderService } = await setup();
    await mk('Read');
    await settingsService.update({ reminderEnabled: true });
    const t = new Date('2026-10-09T20:00:30+07:00');
    const spy = vi.spyOn(tc.notifications, 'show').mockRejectedValueOnce(new Error('sw gone'));
    const [a, b] = await Promise.allSettled([reminderService.check(t), reminderService.check(t)]);
    expect(a.status).toBe('rejected');
    expect(b.status).toBe('fulfilled');
    expect(b.status === 'fulfilled' && b.value).toBe(true);
    spy.mockRestore();
    expect(await reminderService.check(t)).toBe(false); // already sent today
    expect((await settingsService.get()).lastReminderDate).toBe('2026-10-09');
    await tc.dispose();
  });
  it('show() resolving false (could not display) does not mark the day as sent; a later check retries', async () => {
    const { tc, mk, settingsService, reminderService } = await setup();
    await mk('Read');
    await settingsService.update({ reminderEnabled: true });
    const t = new Date('2026-10-09T20:00:30+07:00');
    const spy = vi.spyOn(tc.notifications, 'show').mockResolvedValueOnce(false);
    expect(await reminderService.check(t)).toBe(false);
    spy.mockRestore();
    expect(await reminderService.check(new Date('2026-10-09T20:05:00+07:00'))).toBe(true);
    await tc.dispose();
  });
  it('50 concurrent starts yield exactly one timer; 50 concurrent saves exactly one entry', async () => {
    const { tc, mk, now, timerService } = await setup();
    const goals = await Promise.all([mk('A'), mk('B'), mk('C')]);
    const starts = await Promise.all(Array.from({ length: 50 }, (_, i) => timerService.start(goals[i % 3].id, now)));
    expect(starts.filter((r) => r.ok)).toHaveLength(1);
    const later = new Date(now.getTime() + 10 * 60_000);
    const saves = await Promise.all(Array.from({ length: 50 }, () => timerService.save({ minutes: 10, note: '' }, later)));
    expect(saves.filter((r) => r.ok)).toHaveLength(1);
    expect(await tc.container.db.entries.count()).toBe(1);
    await tc.dispose();
  });
});
