// QC-owned unit/service tests for M2 (round 1). Written from TASKS.md M2-AC* and RFC 5545, not from the dev tests.
import { describe, expect, it } from 'vitest';
import { buildReminderIcs, escapeIcsText, foldIcsLine } from '../../src/domain/ics';
import { isPastReminderTime, reminderData, shouldNotify, shouldShowBanner, type GoalProgress } from '../../src/domain/reminder';
import { elapsedMs, previewTimer, roundedMinutes, timerDate } from '../../src/domain/timer';
import en from '../../src/i18n/resources/en.json';
import vi from '../../src/i18n/resources/vi.json';
import { createTestContainer } from '../../src/test/container';
import { normalizeSettings } from '../../src/services/settings-service';

const enc = new TextEncoder();
const octets = (s: string) => enc.encode(s).length;

/** RFC 5545 §3.1 unfolding: CRLF followed by one space/tab is removed. */
const unfold = (text: string) => text.replace(/\r\n[ \t]/g, '');

const baseIcs = {
  reminderTime: '20:00',
  today: '2026-10-09',
  summary: en.ics.summary,
  alarmDescription: en.ics.alarm,
  uid: 'abc@one-percent-better',
  now: new Date('2026-10-09T03:00:00Z'),
};

describe('M2-AC11 / AC13 .ics — RFC 5545 structure', () => {
  const text = buildReminderIcs(baseIcs);
  it('uses CRLF only (no bare LF or CR) and ends with CRLF', () => {
    expect(text.endsWith('\r\n')).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });
  it('is a single VCALENDAR with one properly nested VEVENT and VALARM', () => {
    const lines = unfold(text).split('\r\n').filter(Boolean);
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines.at(-1)).toBe('END:VCALENDAR');
    const stack: string[] = [];
    for (const l of lines) {
      if (l.startsWith('BEGIN:')) stack.push(l.slice(6));
      else if (l.startsWith('END:')) expect(stack.pop()).toBe(l.slice(4));
    }
    expect(stack).toEqual([]);
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1);
    expect(lines.filter((l) => l === 'BEGIN:VALARM')).toHaveLength(1);
  });
  it('has the AC11 properties, DTSTART floating, DTSTAMP in UTC', () => {
    for (const p of ['VERSION:2.0', 'PRODID:-//1% Better//EN', 'DTSTART:20261010T200000', 'DURATION:PT15M', 'RRULE:FREQ=DAILY', 'TRIGGER:PT0M', 'ACTION:DISPLAY']) {
      expect(text).toContain(`${p}\r\n`);
    }
    expect(text).toMatch(/\r\nDTSTAMP:\d{8}T\d{6}Z\r\n/);
    expect(text).toContain('DTSTAMP:20261009T030000Z\r\n');
    expect(text).not.toMatch(/DTSTART[^\r]*Z\r\n/);
    expect(text).toMatch(/\r\nUID:[^\r\n]+\r\n/);
  });
  it('DTSTART = tomorrow at the reminder time across month/year/leap boundaries and for 00:00 / 23:59', () => {
    const f = (today: string, time: string) => /DTSTART:(\S+)\r\n/.exec(buildReminderIcs({ ...baseIcs, today, reminderTime: time }))?.[1];
    expect(f('2026-12-31', '07:30')).toBe('20270101T073000');
    expect(f('2028-02-28', '00:00')).toBe('20280229T000000');
    expect(f('2028-02-29', '23:59')).toBe('20280301T235900');
    expect(f('2026-10-31', '20:00')).toBe('20261101T200000');
  });
  it('RRULE appears before the end of the VEVENT and there is exactly one RRULE/DTSTART', () => {
    expect(text.match(/RRULE:/g)).toHaveLength(1);
    expect(text.match(/DTSTART/g)).toHaveLength(1);
  });
});

describe('M2-AC13 .ics — escaping and folding', () => {
  it('escapes backslash, semicolon, comma and newlines in TEXT values', () => {
    expect(escapeIcsText('a\\b;c,d\ne\r\nf\rg')).toBe('a\\\\b\\;c\\,d\\ne\\nf\\ng');
  });
  it('a summary containing , ; \\ and a newline round-trips through unfold + unescape', () => {
    const summary = 'A, B; C \\ D\nE';
    const out = unfold(buildReminderIcs({ ...baseIcs, summary }));
    const raw = /SUMMARY:(.*)\r\n/.exec(out)![1];
    const un = raw.replace(/\\n/gi, '\n').replace(/\\([;,\\])/g, '$1');
    expect(un).toBe(summary);
  });
  it('fold: every physical line <= 75 octets, unfold restores the original, never splits a UTF-8 sequence (fuzz)', () => {
    const pieces = ['a', 'Z', 'ế', 'ộ', 'Đ', '—', '🙂', 'é', '\\,', ' ', 'e\u0301', '漢'];
    let seed = 12345;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let i = 0; i < 400; i++) {
      const len = 1 + Math.floor(rnd() * 120);
      let s = 'SUMMARY:';
      for (let j = 0; j < len; j++) s += pieces[Math.floor(rnd() * pieces.length)];
      const parts = foldIcsLine(s);
      for (const p of parts) expect(octets(p)).toBeLessThanOrEqual(75);
      for (const p of parts.slice(1)) expect(p.startsWith(' ')).toBe(true);
      expect(parts.map((p, k) => (k === 0 ? p : p.slice(1))).join('')).toBe(s);
      expect(parts.join('')).not.toContain('\uFFFD');
    }
  });
  it('vi summary/alarm from vi.json keep diacritics, lines <= 75 octets, PRODID unchanged', () => {
    const out = buildReminderIcs({ ...baseIcs, summary: vi.ics.summary, alarmDescription: vi.ics.alarm });
    for (const l of out.split('\r\n')) expect(octets(l)).toBeLessThanOrEqual(75);
    expect(unfold(out)).toContain(`SUMMARY:${escapeIcsText(vi.ics.summary)}\r\n`);
    expect(unfold(out)).toContain(`DESCRIPTION:${escapeIcsText(vi.ics.alarm)}\r\n`);
    expect(out).toContain('PRODID:-//1% Better//EN\r\n');
  });
});

const g = (name: string, current: number, target: number): GoalProgress => ({ id: name, name, current, target });
const s1 = [g('Read', 0, 30), g('Guitar', 0, 20), g('Spanish', 0, 17)];
const on = { reminderEnabled: true, reminderTime: '20:00', lastReminderDate: null as string | null };
const local = (h: number, m: number, s = 0, ms = 0) => new Date(2026, 9, 9, h, m, s, ms);

describe('M2-AC7 / AC10 rules at the boundaries', () => {
  it('20:00:00.000 is "past"; 19:59:59.999 is not', () => {
    expect(isPastReminderTime(local(20, 0, 0, 0), '20:00')).toBe(true);
    expect(isPastReminderTime(local(19, 59, 59, 999), '20:00')).toBe(false);
  });
  it('reminder 00:00 is due all day; 23:59 only in the last minute', () => {
    expect(isPastReminderTime(local(0, 0), '00:00')).toBe(true);
    expect(isPastReminderTime(local(23, 58, 59), '23:59')).toBe(false);
    expect(isPastReminderTime(local(23, 59), '23:59')).toBe(true);
  });
  it('malformed reminder times never fire (24:00, 7:30, empty, 20:60)', () => {
    for (const t of ['24:00', '7:30', '', '20:60', '20:00:00', ' 20:00']) expect(isPastReminderTime(local(23, 59), t)).toBe(false);
  });
  it('shouldNotify truth table (5 conditions)', () => {
    const now = local(20, 0, 30);
    expect(shouldNotify(now, on, 'granted', s1)).toBe(true);
    expect(shouldNotify(now, { ...on, reminderEnabled: false }, 'granted', s1)).toBe(false);
    for (const p of ['denied', 'default', 'unsupported'] as const) expect(shouldNotify(now, on, p, s1)).toBe(false);
    expect(shouldNotify(local(19, 59), on, 'granted', s1)).toBe(false);
    expect(shouldNotify(now, { ...on, lastReminderDate: '2026-10-09' }, 'granted', s1)).toBe(false);
    expect(shouldNotify(now, { ...on, lastReminderDate: '2026-10-08' }, 'granted', s1)).toBe(true);
    expect(shouldNotify(now, on, 'granted', [g('Read', 30, 30), g('Guitar', 25, 20)])).toBe(false);
    expect(shouldNotify(now, on, 'granted', [])).toBe(false);
  });
  it('a goal exactly on target (current == target) is not pending; 1 minute short is', () => {
    expect(reminderData([g('a', 30, 30)]).count).toBe(0);
    expect(reminderData([g('a', 29, 30)]).count).toBe(1);
  });
  it('banner ignores permission and the daily cap', () => {
    expect(shouldShowBanner(local(20, 1), { ...on, reminderTime: '20:00' }, s1)).toBe(true);
    expect(shouldShowBanner(local(19, 59), on, s1)).toBe(false);
  });
});

describe('M2-AC3 / AC4 timer maths', () => {
  it('rounding: .5 up, clamp 1..1440, negative clock skew -> 0 s -> 1 minute', () => {
    expect(roundedMinutes(25 * 60_000 + 29_999)).toBe(25);
    expect(roundedMinutes(25 * 60_000 + 30_000)).toBe(26);
    expect(roundedMinutes(0)).toBe(1);
    expect(roundedMinutes(-5000)).toBe(1);
    expect(roundedMinutes(1500 * 60_000)).toBe(1440);
    expect(roundedMinutes(Number.POSITIVE_INFINITY)).toBe(1440);
  });
  it('elapsedMs never negative and survives a corrupt startedAt', () => {
    expect(elapsedMs('2026-10-09T10:00:00+07:00', new Date('2026-10-09T09:00:00+07:00'))).toBe(0);
    expect(elapsedMs('garbage', new Date())).toBe(0);
    expect(previewTimer({ goalId: 'x', startedAt: '2026-10-09T23:50:00+07:00' }, new Date('2026-10-10T00:20:00+07:00')).minutes).toBe(30);
  });
  it('timerDate is the local start day (UTC vs local differ)', () => {
    expect(timerDate('2026-10-09T23:50:00+07:00')).toBe('2026-10-09'); // 16:50Z same day
    expect(timerDate('2026-10-10T00:20:00+07:00')).toBe('2026-10-10'); // 17:20Z previous UTC day
    expect(timerDate('2026-10-09T05:00:00+07:00')).toBe('2026-10-09'); // 22:00Z previous UTC day
  });
});

describe('settings normalisation', () => {
  it('garbage values fall back to defaults', () => {
    const s = normalizeSettings({ reminderEnabled: 'true', reminderTime: '99:99', lastReminderDate: 5 });
    expect(s.reminderEnabled).toBe(false);
    expect(s.reminderTime).toBe('20:00');
    expect(s.lastReminderDate).toBeNull();
    expect(normalizeSettings(null).reminderTime).toBe('20:00');
    expect(normalizeSettings('x').reminderEnabled).toBe(false);
  });
});

let seq = 0;
async function setup(permission: 'granted' | 'denied' = 'granted') {
  const tc = await createTestContainer({ permission });
  const { goalService, settingsService, timerService, entryService, reminderService } = tc.container;
  const now = new Date('2026-10-09T10:00:00+07:00');
  const mk = async (name: string, v = 30, startDate = '2026-10-01', endDate = '2026-10-31') => {
    const r = await goalService.create({ name, why: '', targetType: 'daily', targetValue: v, startDate, endDate }, new Date(now.getTime() + ++seq * 1000));
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    return r.value;
  };
  return { tc, goalService, settingsService, timerService, entryService, reminderService, mk, now };
}

describe('M2-AC13 ReminderService text', () => {
  it('goal names are passed through verbatim (no HTML escaping, no i18n nesting/interpolation of values)', async () => {
    const { tc, mk, settingsService, reminderService } = await setup();
    await mk('R&D <b>x</b>');
    await mk('$t(app.name)');
    await mk('{{count}} "q" \'s\' \\o/');
    await settingsService.update({ reminderEnabled: true });
    expect(await reminderService.check(new Date('2026-10-09T20:00:30+07:00'))).toBe(true);
    const [n] = tc.notifications.shown;
    expect(n.body).toBe('3 goals left today: R&D <b>x</b> 0/30 min, $t(app.name) 0/30 min, {{count}} "q" \'s\' \\o/ 0/30 min');
    await tc.dispose();
  });
  it('4 goals -> "and 1 more" (en) and "và 1 mục tiêu nữa" (vi); 1 goal singular (en)', async () => {
    const { tc, mk, settingsService, reminderService } = await setup();
    for (const n of ['A', 'B', 'C', 'D']) await mk(n);
    await settingsService.update({ reminderEnabled: true });
    await reminderService.check(new Date('2026-10-09T20:00:30+07:00'));
    expect(tc.notifications.shown[0].body).toBe('4 goals left today: A 0/30 min, B 0/30 min, C 0/30 min, and 1 more');
    await tc.container.locale.change('vi');
    await settingsService.update({ lastReminderDate: null });
    await reminderService.check(new Date('2026-10-09T20:00:30+07:00'));
    const v = tc.notifications.shown[1];
    expect(v.lang).toBe('vi');
    expect(v.body).toBe('Hôm nay còn 4 mục tiêu: A 0/30 phút, B 0/30 phút, C 0/30 phút và 1 mục tiêu nữa');
    await tc.dispose();
  });
  it('upcoming and ended goals never appear', async () => {
    const { tc, mk, settingsService, reminderService } = await setup();
    await mk('Active');
    await mk('Future', 30, '2026-11-01', '2026-11-30');
    await mk('Past', 30, '2026-01-01', '2026-06-30');
    await settingsService.update({ reminderEnabled: true });
    await reminderService.check(new Date('2026-10-09T20:00:30+07:00'));
    expect(tc.notifications.shown[0].body).toBe('1 goal left today: Active 0/30 min');
    await tc.dispose();
  });
  it('at most one notification per day across many checks; next day sends again; failure to show does not consume the day', async () => {
    const { tc, mk, settingsService, reminderService } = await setup();
    await mk('Read');
    await settingsService.update({ reminderEnabled: true });
    tc.notifications.canShow = false;
    expect(await reminderService.check(new Date('2026-10-09T20:00:30+07:00'))).toBe(false);
    expect((await settingsService.get()).lastReminderDate).toBeNull();
    tc.notifications.canShow = true;
    for (let i = 0; i < 5; i++) await reminderService.check(new Date(`2026-10-09T20:0${i}:30+07:00`));
    expect(tc.notifications.shown).toHaveLength(1);
    await reminderService.check(new Date('2026-10-10T20:00:30+07:00'));
    expect(tc.notifications.shown).toHaveLength(2);
    await tc.dispose();
  });
  it('goal reaches target after the time: no notification', async () => {
    const { tc, mk, settingsService, reminderService, entryService } = await setup();
    const read = await mk('Read');
    await entryService.add({ goalId: read.id, date: '2026-10-09', minutes: 30, note: '', source: 'manual' }, new Date('2026-10-09T19:00:00+07:00'));
    await settingsService.update({ reminderEnabled: true });
    expect(await reminderService.check(new Date('2026-10-09T20:30:00+07:00'))).toBe(false);
    expect(tc.notifications.shown).toHaveLength(0);
    await tc.dispose();
  });
  // M2-D3 (Minor): known defect, `it.fails` keeps the suite green; remove `.fails` once the services are atomic.
  it.fails('M2-D3: two concurrent check() calls (two tabs) send once', async () => {
    const { tc, mk, settingsService, reminderService } = await setup();
    await mk('Read');
    await settingsService.update({ reminderEnabled: true });
    const t = new Date('2026-10-09T20:00:30+07:00');
    await Promise.all([reminderService.check(t), reminderService.check(t)]);
    expect(tc.notifications.shown.length).toBe(1);
    await tc.dispose();
  });
});

describe('M2 TimerService probes', () => {
  it.fails('M2-D3: two concurrent start() for different goals leave exactly one timer', async () => {
    const { tc, mk, timerService, now } = await setup();
    const a = await mk('A');
    const b = await mk('B');
    const [ra, rb] = await Promise.all([timerService.start(a.id, now), timerService.start(b.id, now)]);
    const okCount = [ra, rb].filter((r) => r.ok).length;
    expect(okCount).toBe(1);
    await tc.dispose();
  });
  it.fails('M2-D3: two concurrent save() create exactly one entry', async () => {
    const { tc, mk, timerService, now } = await setup();
    const a = await mk('A');
    await timerService.start(a.id, now);
    const later = new Date(now.getTime() + 25 * 60_000);
    const [r1, r2] = await Promise.all([timerService.save({ minutes: 25, note: '' }, later), timerService.save({ minutes: 25, note: '' }, later)]);
    const count = await tc.container.db.entries.where('goalId').equals(a.id).count();
    expect(count, 'entries created for one timer session').toBe(1);
    expect([r1, r2].filter((r) => r.ok).length).toBe(1);
    await tc.dispose();
  });
  it('save with minutes 0 / 1441 / 12.5 / NaN is rejected and keeps the timer; 1440 accepted on an empty day', async () => {
    const { tc, mk, timerService, now } = await setup();
    const a = await mk('A');
    await timerService.start(a.id, now);
    const later = new Date(now.getTime() + 25 * 60_000);
    for (const minutes of [0, -1, 1441, 12.5, Number.NaN]) {
      const r = await timerService.save({ minutes, note: '' }, later);
      expect(r.ok).toBe(false);
      expect(await timerService.current()).toBeDefined();
    }
    const longNote = await timerService.save({ minutes: 5, note: 'x'.repeat(281) }, later);
    expect(longNote.ok).toBe(false);
    expect((await timerService.current())?.goalId).toBe(a.id);
    expect((await timerService.save({ minutes: 1440, note: '' }, later)).ok).toBe(true);
    expect(await timerService.current()).toBeUndefined();
    await tc.dispose();
  });
  it('save beyond the 1440 min/day cap is rejected with the timer kept', async () => {
    const { tc, mk, timerService, entryService, now } = await setup();
    const a = await mk('A');
    await entryService.add({ goalId: a.id, date: '2026-10-09', minutes: 1400, note: '', source: 'manual' }, now);
    await timerService.start(a.id, now);
    const r = await timerService.save({ minutes: 41, note: '' }, new Date(now.getTime() + 41 * 60_000));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe('ENTRY_DAY_LIMIT_EXCEEDED');
    expect(await timerService.current()).toBeDefined();
    expect((await timerService.save({ minutes: 40, note: '' }, new Date(now.getTime() + 41 * 60_000))).ok).toBe(true);
    await tc.dispose();
  });
  it('corrupt activeTimer in kv is treated as no timer', async () => {
    const { tc, mk, timerService, now } = await setup();
    const a = await mk('A');
    await tc.container.db.table('kv').put({ key: 'activeTimer', value: { goalId: 5 } });
    expect(await timerService.current()).toBeUndefined();
    expect((await timerService.start(a.id, now)).ok).toBe(true);
    await tc.dispose();
  });
  it('deleting another goal keeps the running timer; deleting the timer goal removes it', async () => {
    const { tc, mk, timerService, goalService, now } = await setup();
    const a = await mk('A');
    const b = await mk('B');
    await timerService.start(a.id, now);
    await goalService.remove(b.id);
    expect((await timerService.current())?.goalId).toBe(a.id);
    await goalService.remove(a.id);
    expect(await timerService.current()).toBeUndefined();
    await tc.dispose();
  });
});
