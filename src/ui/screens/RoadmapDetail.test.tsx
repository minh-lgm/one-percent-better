// @vitest-environment jsdom
// M19-AC1 … AC3, AC7 (component level): the detail screen on dataset Q1 and its variants — overview, strip, "This
// week", phases/items with labels and hours, the quick actions (tick, actual dates, note) with inline errors from the
// `roadmap` namespace, the link states, not found, and the vi scan.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi as vitest } from 'vitest';
import { DexieRoadmapRepository } from '../../data/dexie/roadmap-repo';
import { ensureRoadmapNamespace } from '../../i18n/roadmap-namespace';
import { datasetQ1, FIXED_NOW_Q1, type Q1Variant } from '../../test/builders';
import { createTestContainer, type TestContainer } from '../../test/container';
import { renderApp, renderWithLocale, scanVi } from '../../test/render-with-locale';
import { roadmapView } from '../../domain/roadmap-progress';
import { OverviewMetrics } from '../components/roadmap/OverviewMetrics';
import { ThisWeekCard } from '../components/roadmap/ThisWeekCard';

let tc: TestContainer | undefined;

beforeEach(() => {
  vitest.setSystemTime(FIXED_NOW_Q1);
});
afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

interface SeedOptions {
  variant?: Q1Variant | 'none' | 'archived';
  now?: Date;
  note?: string;
}

async function seed(locale: 'en' | 'vi', { variant, now = FIXED_NOW_Q1, note }: SeedOptions = {}) {
  vitest.setSystemTime(now);
  tc = await createTestContainer({ locale, clock: () => now });
  const d = datasetQ1(variant === 'none' || variant === 'archived' ? undefined : variant);
  const db = tc.container.db;
  await db.goals.bulkPut(variant === 'archived' ? d.goals.map((g) => (g.id === 'gq' ? { ...g, archived: true } : g)) : d.goals);
  await db.entries.bulkPut(d.entries);
  const roadmap = { ...d.roadmap, ...(variant === 'none' ? { goalId: null } : {}), ...(note !== undefined ? { note } : {}) };
  await new DexieRoadmapRepository(db, { clock: () => now }).putMany({ roadmaps: [roadmap], phases: d.phases, items: d.items, checkpoints: d.checkpoints });
  return tc;
}

const item = (id: string) => document.querySelector(`[data-item="${id}"][data-testid="roadmap-item"]`) as HTMLElement;
const itemIn = (id: string) => within(item(id));
const cells = () => screen.getAllByTestId('strip-cell');

describe('RoadmapDetail — view (M19-AC1, AC2)', () => {
  it('en Q1: overview 1/21 · On track · 6.6 h / 16 h · 125 days; 21 cells (1 done, 2 current, none overdue); This week W2 75/480 min, 5 days left; phases, labels, hours; notes as text; title', async () => {
    await seed('en');
    await renderApp({ route: '/roadmaps/rq', container: tc });
    expect(await screen.findByRole('heading', { level: 1, name: 'QPT 21 tuần' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('QPT 21 tuần — 1% Better'));
    expect(screen.getByTestId('detail-goal')).toHaveTextContent('Goal: QPT study');
    expect(within(screen.getByTestId('detail-goal')).getByRole('link')).toHaveAttribute('href', '/goals/gq');
    expect(screen.getByTestId('detail-edit')).toHaveAttribute('href', '/roadmaps/rq/edit');

    const ov = within(screen.getByTestId('overview'));
    expect(ov.getByTestId('pace-chip')).toHaveTextContent('On track');
    expect(ov.getByTestId('pace-sub')).toHaveTextContent('Nothing is overdue.');
    expect(ov.getByTestId('metric-done')).toHaveTextContent('Weeks done');
    expect(ov.getByTestId('done-value')).toHaveTextContent('1/21');
    expect(ov.getByTestId('hours-value')).toHaveTextContent('6.6 h');
    expect(ov.getByTestId('hours-sub')).toHaveTextContent('Planned through this week: 16 h');
    expect(ov.getByTestId('metric-milestone')).toHaveTextContent('Thi QPT');
    expect(ov.getByTestId('milestone-value')).toHaveTextContent('125 days left');
    expect(ov.getByTestId('metric-milestone')).toHaveTextContent('On 2027-03-09');

    const strip = screen.getByRole('list', { name: 'Roadmap items, in order' });
    expect(strip).toBeInTheDocument();
    const c = cells();
    expect(c).toHaveLength(21);
    expect(c[0]).toHaveAttribute('data-state', 'done');
    expect(c[1]).toHaveAttribute('data-current', 'true');
    expect(c.filter((x) => x.getAttribute('data-state') === 'overdue')).toHaveLength(0);
    expect(c[1]).toHaveAccessibleName('Solving systems: elimination, row echelon form, rank, 11/03 – 11/09: this week');
    expect(c[0]).toHaveAccessibleName(/, 10\/27 – 11\/02: done$/);
    expect(c[20]).toHaveAccessibleName(/: upcoming$/);
    // One tab stop: the current cell.
    expect(c.filter((x) => x.tabIndex === 0)).toEqual([c[1]]);

    const now = within(screen.getByTestId('this-week'));
    expect(screen.getByTestId('this-week')).toHaveAttribute('data-kind', 'current');
    expect(now.getByTestId('this-week-eyebrow')).toHaveTextContent('This week · W2 · 2026-11-03 – 11-09');
    expect(now.getByRole('heading', { level: 3 })).toHaveTextContent('Solving systems: elimination, row echelon form, rank');
    expect(now.getByTestId('this-week-minutes')).toHaveTextContent('75/480 min');
    expect(now.getByTestId('this-week-days')).toHaveTextContent('5 days left');
    expect(now.getByRole('progressbar', { name: 'Study time this week' })).toHaveAttribute('aria-valuetext', '75 of 480 minutes');
    expect(now.getByRole('button', { name: 'Mark done' })).toBeInTheDocument();

    const phases = screen.getAllByTestId('phase');
    expect(phases).toHaveLength(5);
    expect(within(phases[0]).getByRole('heading', { level: 3 })).toHaveTextContent('Phase 1 · Linear Algebra');
    expect(within(phases[0]).getByTestId('phase-note')).toHaveTextContent('Course 1 · 34h');
    expect(within(phases[0]).getByTestId('phase-progress')).toHaveTextContent('Done 1/4');
    expect(screen.getAllByTestId('roadmap-item')).toHaveLength(21);
    expect(itemIn('wq1').getByTestId('item-label')).toHaveTextContent('Early by 1 day · studied 6 days');
    expect(itemIn('wq1').getByTestId('item-hours')).toHaveTextContent('4.5 h');
    expect(itemIn('wq1').getByRole('checkbox', { name: /^Mark Systems of linear equations/ })).toBeChecked();
    expect(itemIn('wq2').getByTestId('item-tags')).toHaveTextContent('This week');
    expect(itemIn('wq2').getByTestId('item-hours')).toHaveTextContent('1.3 h');
    expect(itemIn('wq2').getByText(/^Planned 2026-11-03 – 11-09/)).toBeInTheDocument();
    expect(itemIn('wq3').getByTestId('item-hours')).toHaveTextContent('0 h');
    expect(itemIn('wq3').queryByTestId('item-tags')).toBeNull();
    // The current item is open by default, the others closed.
    expect(itemIn('wq2').getByRole('button', { name: /^Dates & note/ })).toHaveAttribute('aria-expanded', 'true');
    expect(itemIn('wq3').getByRole('button', { name: /^Dates & note/ })).toHaveAttribute('aria-expanded', 'false');
    expect(itemIn('wq2').getByRole('button', { name: 'Today: set actual start of Solving systems: elimination, row echelon form, rank' })).toBeInTheDocument();

    const note = screen.getByTestId('roadmap-note');
    expect(note).toHaveTextContent('Nhịp học mỗi tuần');
    expect(note).toHaveTextContent('Quiz chưa đạt 80% thì chưa sang module mới.');
    expect(note.querySelector('.rd-note')?.textContent?.split('\n')).toHaveLength(7);
    expect(screen.getByTestId('how-hours')).toHaveTextContent('How study time is counted');
  });

  it('a note containing <b>x</b> is rendered as literal text, never as HTML', async () => {
    await seed('en', { note: 'Weekly rhythm\n<b>bold?</b> no' });
    await renderApp({ route: '/roadmaps/rq', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'QPT 21 tuần' });
    expect(screen.getByTestId('roadmap-note')).toHaveTextContent('<b>bold?</b> no');
    expect(screen.getByTestId('roadmap-note').querySelector('b')).toBeNull();
  });

  it('clicking cell 15 focuses the W15 row', async () => {
    const user = userEvent.setup();
    await seed('en');
    await renderApp({ route: '/roadmaps/rq', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'QPT 21 tuần' });
    await user.click(cells()[14]);
    expect(document.activeElement).toBe(item('wq15'));
    // Arrow keys move the roving focus; Home/End jump.
    cells()[1].focus();
    fireEvent.keyDown(cells()[1], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cells()[2]);
    fireEvent.keyDown(cells()[2], { key: 'End' });
    expect(document.activeElement).toBe(cells()[20]);
  });

  it('Q1b: "1 week behind" (warn), cell 1 overdue; at 2026-11-10 with W2 still open: "2 weeks behind" (crit)', async () => {
    await seed('en', { variant: 'b' });
    await renderApp({ route: '/roadmaps/rq', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'QPT 21 tuần' });
    const ov = within(screen.getByTestId('overview'));
    expect(ov.getByTestId('pace-chip')).toHaveTextContent('1 week behind');
    expect(ov.getByTestId('pace-chip')).toHaveClass('warn');
    expect(ov.getByTestId('pace-sub')).toHaveTextContent('Use a spare week or day to catch up.');
    expect(cells()[0]).toHaveAttribute('data-state', 'overdue');
    expect(cells()[0]).toHaveAccessibleName(/: overdue, not done$/);
    expect(itemIn('wq1').getByTestId('item-tags')).toHaveTextContent('Overdue');
    expect(itemIn('wq1').getByTestId('item-label')).toHaveTextContent('In progress');
    expect(ov.getByTestId('done-value')).toHaveTextContent('0/21');
    cleanup();
    await tc!.dispose();
    await seed('en', { variant: 'b', now: new Date('2026-11-10T10:00:00+07:00') });
    await renderApp({ route: '/roadmaps/rq', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'QPT 21 tuần' });
    const chip = within(screen.getByTestId('overview')).getByTestId('pace-chip');
    expect(chip).toHaveTextContent('2 weeks behind');
    expect(chip).toHaveClass('crit');
    expect(within(screen.getByTestId('overview')).getByTestId('pace-sub')).toHaveTextContent('Consider moving your planned dates or milestone.');
  });

  it('Q1d (today 2026-10-26): Not started, "Starts 2026-10-27", This week card before the roadmap, 134 days', async () => {
    await seed('en', { now: new Date('2026-10-26T10:00:00+07:00') });
    await renderApp({ route: '/roadmaps/rq', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'QPT 21 tuần' });
    const ov = within(screen.getByTestId('overview'));
    expect(ov.getByTestId('pace-chip')).toHaveTextContent('Not started');
    expect(ov.getByTestId('pace-sub')).toHaveTextContent('Starts 2026-10-27');
    expect(ov.getByTestId('milestone-value')).toHaveTextContent('134 days left');
    expect(screen.getByTestId('this-week')).toHaveAttribute('data-kind', 'notStarted');
    expect(screen.getByTestId('this-week')).toHaveTextContent('Starts 2026-10-27. First up: Systems of linear equations: singular vs non-singular, determinant.');
    expect(cells().filter((x) => x.hasAttribute('data-current'))).toHaveLength(0);
  });

  it('Q1e (goal deleted elsewhere): hours "—" everywhere, "The linked goal was deleted." + Link a goal; unlinked → "Link a goal to count study time."; archived → hours kept + note', async () => {
    await seed('en', { variant: 'e' });
    await renderApp({ route: '/roadmaps/rq', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'QPT 21 tuần' });
    expect(screen.getByTestId('detail-goal')).toHaveTextContent('The linked goal was deleted');
    const ov = within(screen.getByTestId('overview'));
    expect(ov.getByTestId('hours-value')).toHaveTextContent('—');
    expect(ov.getByTestId('hours-sub')).toHaveTextContent('The linked goal was deleted.');
    expect(ov.getByTestId('overview-link-goal')).toHaveAttribute('href', '/roadmaps/rq/edit?focus=goal');
    expect(itemIn('wq1').getByTestId('item-hours')).toHaveTextContent('—');
    expect(within(screen.getByTestId('this-week')).getByTestId('this-week-minutes')).toHaveTextContent('—');
    expect(within(screen.getByTestId('this-week')).queryByRole('progressbar')).toBeNull();
    expect(ov.getByTestId('done-value')).toHaveTextContent('1/21');
    cleanup();
    await tc!.dispose();
    await seed('en', { variant: 'none' });
    await renderApp({ route: '/roadmaps/rq', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'QPT 21 tuần' });
    expect(screen.getByTestId('detail-goal')).toHaveTextContent('No goal linked');
    expect(within(screen.getByTestId('overview')).getByTestId('hours-sub')).toHaveTextContent('Link a goal to count study time.');
    cleanup();
    await tc!.dispose();
    await seed('en', { variant: 'archived' });
    await renderApp({ route: '/roadmaps/rq', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'QPT 21 tuần' });
    expect(screen.getByTestId('detail-goal')).toHaveTextContent('Goal: QPT study archived');
    expect(within(screen.getByTestId('overview')).getByTestId('hours-value')).toHaveTextContent('6.6 h');
    expect(within(screen.getByTestId('overview')).getByTestId('hours-sub')).toHaveTextContent('The linked goal is archived. Its time still counts. Planned through this week: 16 h');
  });

  it('unknown id → "Big goal not found" with the link to Big goals', async () => {
    await seed('en');
    await renderApp({ route: '/roadmaps/nope', container: tc });
    expect(await screen.findByRole('heading', { level: 1, name: 'Big goal not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Big goals' })).toHaveAttribute('href', '/roadmaps');
  });

  it('ThisWeekCard kind gap → "Nothing is planned for today." without minutes or days (v8.2)', async () => {
    tc = await createTestContainer({ locale: 'en', clock: () => FIXED_NOW_Q1 });
    await ensureRoadmapNamespace(tc.i18n);
    await renderWithLocale(<ThisWeekCard view={{ kind: 'gap' }} items={[]} weekBased hoursKnown onToggleDone={() => undefined} />, 'en', { container: tc });
    const card = screen.getByTestId('this-week');
    expect(card).toHaveAttribute('data-kind', 'gap');
    expect(card).toHaveTextContent('Nothing is planned for today.');
    expect(card.textContent).not.toMatch(/\d/);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('RoadmapDetail — quick actions (M19-AC3, vi)', () => {
  it('tick W2 → 2/21, end 04/11/2026, "Sớm 5 ngày"; untick → 1/21; W3 "Hôm nay" start → "Đang học", 0,5 giờ / W2 0,8 giờ, total 6,6; future end → DATE_IN_FUTURE (roadmap copy); note saved; scan clean', async () => {
    const user = userEvent.setup();
    await seed('vi');
    await renderApp({ route: '/roadmaps/rq', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'QPT 21 tuần' });
    const ov = within(screen.getByTestId('overview'));
    expect(ov.getByTestId('done-value')).toHaveTextContent('1/21');
    expect(ov.getByTestId('hours-value')).toHaveTextContent('6,6 giờ');

    // (1) tick W2
    const w2check = itemIn('wq2').getByRole('checkbox');
    await user.click(w2check);
    await waitFor(() => expect(ov.getByTestId('done-value')).toHaveTextContent('2/21'));
    expect(document.activeElement).toBe(itemIn('wq2').getByRole('checkbox'));
    expect(itemIn('wq2').getByLabelText('Kết thúc thực tế')).toHaveValue('2026-11-04');
    expect(itemIn('wq2').getByTestId('item-label')).toHaveTextContent('Sớm 5 ngày');
    expect(itemIn('wq2').getByTestId('item-label')).not.toHaveTextContent('học');
    expect(screen.getByTestId('detail-status')).toHaveTextContent('Đã đánh dấu xong: Solving systems: elimination, row echelon form, rank');
    expect(within(screen.getByTestId('this-week')).getByRole('button', { name: 'Bỏ đánh dấu xong' })).toBeInTheDocument();
    expect(cells()[1]).toHaveAttribute('data-state', 'done');

    // (2) untick
    await user.click(itemIn('wq2').getByRole('checkbox'));
    await waitFor(() => expect(ov.getByTestId('done-value')).toHaveTextContent('1/21'));
    expect(itemIn('wq2').getByLabelText('Kết thúc thực tế')).toHaveValue('');
    expect(itemIn('wq2').queryByTestId('item-label')).toBeNull();

    // (3) W3: Today for the actual start
    await user.click(itemIn('wq3').getByRole('button', { name: /^Ngày & ghi chú/ }));
    await user.click(itemIn('wq3').getByRole('button', { name: /^Hôm nay: đặt ngày bắt đầu thực tế của/ }));
    await waitFor(() => expect(itemIn('wq3').getByTestId('item-label')).toHaveTextContent('Đang học'));
    expect(itemIn('wq3').getByLabelText('Bắt đầu thực tế')).toHaveValue('2026-11-04');
    expect(itemIn('wq3').getByTestId('item-hours')).toHaveTextContent('0,5 giờ');
    expect(itemIn('wq2').getByTestId('item-hours')).toHaveTextContent('0,8 giờ');
    expect(ov.getByTestId('hours-value')).toHaveTextContent('6,6 giờ');

    // (4) W3 end 05/11/2026 → DATE_IN_FUTURE from the roadmap namespace, nothing saved
    const end = itemIn('wq3').getByLabelText('Kết thúc thực tế');
    fireEvent.change(end, { target: { value: '2026-11-05' } });
    await waitFor(() => expect(itemIn('wq3').getByRole('alert')).toHaveTextContent('Ngày thực tế không được sau hôm nay.'));
    expect(end).toHaveAttribute('aria-invalid', 'true');
    expect(end).toHaveValue('2026-11-05');
    expect((await tc!.container.db.roadmapItems.get('wq3'))?.actualEnd).toBeNull();
    expect(ov.getByTestId('done-value')).toHaveTextContent('1/21');

    // (5) note on W2 (saved after the pause)
    const note = itemIn('wq2').getByLabelText('Ghi chú');
    await user.type(note, 'sai dấu');
    await waitFor(() => expect(tc!.container.db.roadmapItems.get('wq2').then((r) => r?.note)).resolves.toBe('sai dấu'));
    await waitFor(() => expect(itemIn('wq2').getByTestId('item-note')).toHaveTextContent('sai dấu'));
    expect(document.activeElement).toBe(itemIn('wq2').getByLabelText('Ghi chú'));
    expect(scanVi()).toEqual([]);
  });

  it('actual end before the actual start → ROADMAP_DATE_INVALID_order under the end field; Clear removes the start', async () => {
    const user = userEvent.setup();
    await seed('en');
    await renderApp({ route: '/roadmaps/rq', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'QPT 21 tuần' });
    await user.click(itemIn('wq3').getByRole('button', { name: /^Dates & note/ }));
    fireEvent.change(itemIn('wq3').getByLabelText('Actual start'), { target: { value: '2026-11-03' } });
    await waitFor(() => expect(itemIn('wq3').getByTestId('item-label')).toHaveTextContent('In progress'));
    fireEvent.change(itemIn('wq3').getByLabelText('Actual end'), { target: { value: '2026-11-02' } });
    await waitFor(() => expect(itemIn('wq3').getByRole('alert')).toHaveTextContent("The end date can't be before the start date."));
    await user.click(itemIn('wq3').getByRole('button', { name: /^Clear actual start of/ }));
    await waitFor(() => expect(itemIn('wq3').queryByTestId('item-label')).toBeNull());
    expect(itemIn('wq3').getByLabelText('Actual start')).toHaveValue('');
  });
});

describe('M21 — Study time = goal total + the hours-outside line (M21-AC2, AC4; DESIGN v8.3)', () => {
  const EN_HOW =
    "The total is everything logged on the linked goal, the same figure the goal's page shows. An item's hours include only the days counted for it, and each day counts for one item: the one you've started or finished on that date, otherwise the one whose planned dates include it. A day that falls in no item isn't added to any item, but it still counts in the total.";
  const VI_HOW =
    'Tổng giờ học là toàn bộ thời gian đã ghi ở mục tiêu được liên kết, đúng con số trang mục tiêu hiển thị. Giờ của từng mục chỉ gồm các ngày tính cho mục đó; mỗi ngày chỉ tính cho một mục: mục bạn đã bắt đầu hoặc đã xong vào ngày đó, nếu không có thì mục có ngày kế hoạch bao gồm ngày ấy. Ngày không rơi vào mục nào thì không cộng cho mục nào, nhưng vẫn nằm trong tổng.';

  it("en Q1: 6.6 h, then \"Includes 0.8 h from before the roadmap's start date.\", then the plan line; items 4.5 / 1.3 / 0; how-hours body", async () => {
    await seed('en');
    await renderApp({ route: '/roadmaps/rq', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'QPT 21 tuần' });
    const hours = within(screen.getByTestId('metric-hours'));
    expect(hours.getByTestId('hours-value')).toHaveTextContent('6.6 h');
    const outside = hours.getByTestId('hours-outside');
    expect(outside).toHaveTextContent(/^Includes 0\.8 h from before the roadmap's start date\.$/);
    expect(outside).not.toHaveAttribute('aria-live');
    expect(outside).not.toHaveAttribute('aria-hidden');
    expect(hours.getByTestId('hours-sub')).toHaveTextContent('Planned through this week: 16 h');
    // DOM order = reading order: number → hours-outside → plan line
    const order = [...screen.getByTestId('metric-hours').querySelectorAll('[data-testid]')].map((n) => n.getAttribute('data-testid'));
    expect(order).toEqual(['hours-value', 'hours-outside', 'hours-sub']);
    expect(itemIn('wq1').getByTestId('item-hours')).toHaveTextContent('4.5 h');
    expect(itemIn('wq2').getByTestId('item-hours')).toHaveTextContent('1.3 h');
    expect(itemIn('wq3').getByTestId('item-hours')).toHaveTextContent('0 h');
    expect(screen.getByTestId('this-week')).toHaveTextContent('75/480 min');
    expect(screen.getByTestId('how-hours').querySelector('p')?.textContent).toBe(EN_HOW);
  });

  it('vi Q1: 6,6 giờ + "Gồm 0,8 giờ từ trước ngày bắt đầu lộ trình."; how-hours body vi; scan clean', async () => {
    await seed('vi');
    await renderApp({ route: '/roadmaps/rq', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'QPT 21 tuần' });
    const hours = within(screen.getByTestId('metric-hours'));
    expect(hours.getByTestId('hours-value')).toHaveTextContent('6,6 giờ');
    expect(hours.getByTestId('hours-outside')).toHaveTextContent(/^Gồm 0,8 giờ từ trước ngày bắt đầu lộ trình\.$/);
    expect(hours.getByTestId('hours-sub')).toHaveTextContent('Kế hoạch đến hết tuần này: 16 giờ');
    expect(screen.getByTestId('how-hours').querySelector('p')?.textContent).toBe(VI_HOW);
    expect(scanVi()).toEqual([]);
  });

  it('archived goal: the line stays and the archived sentence keeps its place in the plan line', async () => {
    await seed('en', { variant: 'archived' });
    await renderApp({ route: '/roadmaps/rq', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'QPT 21 tuần' });
    const hours = within(screen.getByTestId('metric-hours'));
    expect(hours.getByTestId('hours-value')).toHaveTextContent('6.6 h');
    expect(hours.getByTestId('hours-outside')).toHaveTextContent("Includes 0.8 h from before the roadmap's start date.");
    expect(hours.getByTestId('hours-sub')).toHaveTextContent('The linked goal is archived. Its time still counts. Planned through this week: 16 h');
  });

  describe('OverviewMetrics variants (direct render)', () => {
    const d = datasetQ1();
    const gq = d.goals.find((g) => g.id === 'gq')!;
    const gqEntries = d.entries.filter((e) => e.goalId === 'gq');
    const today = '2026-11-04';
    const gapItems = () => [
      { ...d.items[0], id: 'a', actualStart: null, actualEnd: null, plannedStart: '2026-11-01', plannedEnd: '2026-11-03' },
      { ...d.items[1], id: 'b', plannedStart: '2026-11-06', plannedEnd: '2026-11-12' },
    ];
    async function renderView(view: ReturnType<typeof roadmapView>, locale: 'en' | 'vi' = 'en') {
      tc = await createTestContainer({ locale, clock: () => FIXED_NOW_Q1 });
      await ensureRoadmapNamespace(tc.i18n);
      await renderWithLocale(<OverviewMetrics view={view} />, locale, { container: tc });
      return within(screen.getByTestId('metric-hours'));
    }

    it('gap (A 11-01 – 11-03, B 11-06 – 11-12): outside 230 ≠ before 200 → the general sentence "Includes 3.8 h from days that fall outside every item."', async () => {
      const hours = await renderView(roadmapView({ ...d, items: gapItems(), checkpoints: [] }, gq, gqEntries, today));
      expect(hours.getByTestId('hours-value')).toHaveTextContent('6.6 h');
      expect(hours.getByTestId('hours-outside')).toHaveTextContent(/^Includes 3\.8 h from days that fall outside every item\.$/);
    });

    it('vi gap → "Gồm 3,8 giờ ở những ngày không thuộc mục nào."', async () => {
      const hours = await renderView(roadmapView({ ...d, items: gapItems(), checkpoints: [] }, gq, gqEntries, today), 'vi');
      expect(hours.getByTestId('hours-outside')).toHaveTextContent(/^Gồm 3,8 giờ ở những ngày không thuộc mục nào\.$/);
    });

    it('Q1 without the 10-20 entry → 5.8 h and no hours-outside line', async () => {
      const hours = await renderView(roadmapView(d, gq, gqEntries.filter((e) => e.date !== '2026-10-20'), today));
      expect(hours.getByTestId('hours-value')).toHaveTextContent('5.8 h');
      expect(hours.queryByTestId('hours-outside')).toBeNull();
    });

    it('no items yet (rq linked to gq) → 6.6 h and no hours-outside line (DESIGN A-D98, OQ-D88)', async () => {
      const view = roadmapView({ ...d, items: [], checkpoints: [] }, gq, gqEntries, today);
      expect(view.outsideMinutes).toBe(395);
      const hours = await renderView(view);
      expect(hours.getByTestId('hours-value')).toHaveTextContent('6.6 h');
      expect(hours.queryByTestId('hours-outside')).toBeNull();
    });

    it('Q1e (goal gone → missing) and unlinked (none) → "—" and no hours-outside line', async () => {
      const missing = await renderView(roadmapView(datasetQ1('e'), null, [], today));
      expect(missing.getByTestId('hours-value')).toHaveTextContent('—');
      expect(missing.queryByTestId('hours-outside')).toBeNull();
      cleanup();
      await tc!.dispose();
      const none = await renderView(roadmapView({ ...d, roadmap: { ...d.roadmap, goalId: null } }, null, gqEntries, today));
      expect(none.getByTestId('hours-value')).toHaveTextContent('—');
      expect(none.queryByTestId('hours-outside')).toBeNull();
    });
  });
});
