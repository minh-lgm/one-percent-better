// QC round 3 (M2): cross-tab claim of the reminder day (KvRepository.update / claimReminderDay / releaseReminderDay).
import { describe, expect, it, vi } from 'vitest';
import { createTestContainer } from '../../src/test/container';

async function setup() {
  const tc = await createTestContainer({ permission: 'granted' });
  const { goalService, settingsService, reminderService } = tc.container;
  const now = new Date('2026-10-09T10:00:00+07:00');
  const r = await goalService.create({ name: 'Read', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, now);
  if (!r.ok) throw new Error('goal create failed: ' + JSON.stringify(r.errors));
  await settingsService.update({ reminderEnabled: true });
  return { tc, settingsService, reminderService };
}
const t = new Date('2026-10-09T20:00:30+07:00');

describe('M2 reminder claim (cross-tab, round 2 fix)', () => {
  it('failed show() (throw) gives back the PREVIOUS lastReminderDate, not null', async () => {
    const { tc, settingsService, reminderService } = await setup();
    await settingsService.update({ lastReminderDate: '2026-10-08' });
    const spy = vi.spyOn(tc.notifications, 'show').mockRejectedValueOnce(new Error('sw gone'));
    await expect(reminderService.check(t)).rejects.toThrow('sw gone');
    expect((await settingsService.get()).lastReminderDate).toBe('2026-10-08');
    spy.mockRestore();
    expect(await reminderService.check(t)).toBe(true);
    expect((await settingsService.get()).lastReminderDate).toBe('2026-10-09');
    await tc.dispose();
  });
  it('failed show() (false) gives the claim back and a later check retries', async () => {
    const { tc, settingsService, reminderService } = await setup();
    const spy = vi.spyOn(tc.notifications, 'show').mockResolvedValueOnce(false);
    expect(await reminderService.check(t)).toBe(false);
    expect((await settingsService.get()).lastReminderDate).toBeNull();
    spy.mockRestore();
    expect(await reminderService.check(t)).toBe(true);
    await tc.dispose();
  });
  it('claim is visible to others while show() is pending, and other settings changed meanwhile survive claim and release', async () => {
    const { tc, settingsService, reminderService } = await setup();
    let finish!: (v: boolean) => void;
    const spy = vi.spyOn(tc.notifications, 'show').mockImplementationOnce(() => new Promise<boolean>((res) => (finish = res)));
    const p = reminderService.check(t);
    await vi.waitFor(async () => expect((await settingsService.get()).lastReminderDate).toBe('2026-10-09'));
    await settingsService.update({ reminderTime: '21:15' }); // user edits while the send is in flight
    expect(await settingsService.claimReminderDay('2026-10-09')).toBe(false); // other tab loses
    finish(false); // send fails -> release
    expect(await p).toBe(false);
    const s = await settingsService.get();
    expect(s.lastReminderDate).toBeNull();
    expect(s.reminderTime).toBe('21:15');
    expect(s.reminderEnabled).toBe(true);
    spy.mockRestore();
    await tc.dispose();
  });
  it('release does not undo a claim of a different day', async () => {
    const { tc, settingsService } = await setup();
    expect(await settingsService.claimReminderDay('2026-10-10')).toBe(true);
    await settingsService.releaseReminderDay('2026-10-09', null);
    expect((await settingsService.get()).lastReminderDate).toBe('2026-10-10');
    await tc.dispose();
  });
  it('30 concurrent claims on the same day: exactly one wins; 5 concurrent checks send exactly once', async () => {
    const { tc, settingsService, reminderService } = await setup();
    const wins = await Promise.all(Array.from({ length: 30 }, () => settingsService.claimReminderDay('2026-10-12')));
    expect(wins.filter(Boolean)).toHaveLength(1);
    const spy = vi.spyOn(tc.notifications, 'show');
    const res = await Promise.all(Array.from({ length: 5 }, () => reminderService.check(t)));
    expect(res.filter(Boolean)).toHaveLength(1);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    await tc.dispose();
  });
});
