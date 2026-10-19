import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import { buildEntry } from '../../test/builders';
import type { TestContainer } from '../../test/container';
import { renderApp, scanVi } from '../../test/render-with-locale';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

async function fillValidGoal(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('textbox', { name: /^Name/ }), 'Read');
  await user.type(screen.getByRole('textbox', { name: /^Why/ }), 'Be smarter');
  await user.type(screen.getByRole('textbox', { name: /^Minutes per day/ }), '30');
}

describe('GoalForm (M1-AC2, M1-AC3, M1-AC8)', () => {
  it('creates a goal and navigates to Goals with a toast', async () => {
    const user = userEvent.setup();
    const app = await renderApp({ route: '/goals/new' });
    tc = app.tc;
    expect(screen.getByRole('heading', { level: 1, name: en.goal.form.titleNew })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Start date/)).toHaveValue('2026-10-09');
    expect(screen.getByRole('radio', { name: 'This year — ends 2026-12-31' })).toBeChecked();
    await fillValidGoal(user);
    expect(screen.getByText("That's 2,520 min (42.0 h) over 84 days.")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: en.goal.form.save }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: en.goals.title })).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(en.toast.goalCreated));
    expect(await screen.findByRole('heading', { level: 3, name: 'Read' })).toBeInTheDocument();
    const goals = await tc.container.db.goals.toArray();
    expect(goals).toHaveLength(1);
    expect(goals[0]).toMatchObject({ name: 'Read', why: 'Be smarter', targetType: 'daily', targetMinutes: 30, startDate: '2026-10-09', endDate: '2026-12-31' });
  });

  it('shows the inline error for an empty name and does not save', async () => {
    const user = userEvent.setup();
    const app = await renderApp({ route: '/goals/new' });
    tc = app.tc;
    await user.type(screen.getByRole('textbox', { name: /^Minutes per day/ }), '30');
    await user.click(screen.getByRole('button', { name: en.goal.form.save }));
    const name = screen.getByRole('textbox', { name: /^Name/ });
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAttribute('aria-describedby', expect.stringContaining('goal-name-err'));
    expect(document.getElementById('goal-name-err')).toHaveTextContent(en.errors.GOAL_NAME_REQUIRED);
    expect(screen.getByRole('alert')).toHaveTextContent('Fix 1 field to save.');
    expect(name).toHaveFocus();
    expect(await tc.container.db.goals.count()).toBe(0);
  });

  it('shows errors on every field and the plural summary', async () => {
    const user = userEvent.setup();
    const app = await renderApp({ route: '/goals/new' });
    tc = app.tc;
    await user.click(screen.getByRole('textbox', { name: /^Why/ }));
    await user.paste('a'.repeat(281));
    await user.type(screen.getByRole('textbox', { name: /^Minutes per day/ }), '0');
    await user.click(screen.getByRole('radio', { name: en.goal.form.endsSpecific }));
    fireEvent.change(screen.getByLabelText(/^End date/), { target: { value: '2026-01-01' } });
    await user.click(screen.getByRole('button', { name: en.goal.form.save }));
    expect(screen.getByRole('alert')).toHaveTextContent('Fix 4 fields to save.');
    expect(document.getElementById('goal-why-err')).toHaveTextContent(en.errors.GOAL_WHY_TOO_LONG);
    expect(document.getElementById('goal-target-err')).toHaveTextContent(en.errors.GOAL_TARGET_INVALID_daily);
    expect(document.getElementById('goal-end-err')).toHaveTextContent(en.errors.GOAL_PERIOD_INVALID_endBeforeStart);
  });

  it.each(['0x1E', '1e1', '0b11'])('rejects JavaScript numeric syntax %s in Minutes per day and Total hours (M1-D3)', async (raw) => {
    const user = userEvent.setup();
    const app = await renderApp({ route: '/goals/new' });
    tc = app.tc;
    await user.type(screen.getByRole('textbox', { name: /^Name/ }), 'T');
    await user.type(screen.getByRole('textbox', { name: /^Minutes per day/ }), raw);
    await user.click(screen.getByRole('button', { name: en.goal.form.save }));
    await waitFor(() => expect(document.getElementById('goal-target-err')).toHaveTextContent(en.errors.GOAL_TARGET_INVALID_daily));
    expect(await tc.container.db.goals.count()).toBe(0);
    await user.click(screen.getByRole('radio', { name: en.goal.form.targetTotal }));
    const hours = screen.getByRole('textbox', { name: /^Total hours/ });
    await user.clear(hours);
    await user.type(hours, raw);
    await user.click(screen.getByRole('button', { name: en.goal.form.save }));
    await waitFor(() => expect(document.getElementById('goal-target-err')).toHaveTextContent(en.errors.GOAL_TARGET_INVALID_total));
    expect(await tc.container.db.goals.count()).toBe(0);
  });

  it('total hours: hint, derived target and tooMuch error', async () => {
    const user = userEvent.setup();
    const app = await renderApp({ route: '/goals/new' });
    tc = app.tc;
    await user.type(screen.getByRole('textbox', { name: /^Name/ }), 'Spanish');
    await user.click(screen.getByRole('radio', { name: en.goal.form.targetTotal }));
    await user.type(screen.getByRole('textbox', { name: /^Total hours/ }), '100');
    expect(screen.getByText("That's about 72 min per day over 84 days.")).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: en.goal.form.endsSpecific }));
    fireEvent.change(screen.getByLabelText(/^End date/), { target: { value: '2026-10-09' } });
    await user.click(screen.getByRole('button', { name: en.goal.form.save }));
    await waitFor(() => expect(document.getElementById('goal-target-err')).toHaveTextContent(en.errors.GOAL_TARGET_INVALID_tooMuch));
  });

  it('edit mode: prefilled, entry hint, GOAL_PERIOD_EXCLUDES_ENTRIES shown under Start date', async () => {
    const user = userEvent.setup();
    const app = await renderApp({ route: '/goals' });
    tc = app.tc;
    const created = await tc.container.goalService.create(
      { name: 'Read', why: 'Be smarter', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' },
      new Date(),
    );
    if (!created.ok) throw new Error('setup');
    await tc.container.db.entries.put(buildEntry({ goalId: created.value.id, date: '2026-10-01', minutes: 30 }));
    await app.router.navigate(`/goals/${created.value.id}/edit`);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: en.goal.form.titleEdit })).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('textbox', { name: /^Name/ })).toHaveValue('Read'));
    expect(screen.getByRole('radio', { name: en.goal.form.endsSpecific })).toBeChecked();
    expect(screen.getByText('Your entries run from 2026-10-01 to 2026-10-01, so the period must include those dates.')).toBeInTheDocument();
    const start = screen.getByLabelText(/^Start date/);
    fireEvent.change(start, { target: { value: '2026-10-02' } });
    await user.click(screen.getByRole('button', { name: en.goal.form.saveChanges }));
    await waitFor(() => expect(document.getElementById('goal-start-err')).toHaveTextContent(en.errors.GOAL_PERIOD_EXCLUDES_ENTRIES));
    expect(start).toHaveFocus();
    expect((await tc.container.db.goals.get(created.value.id))?.startDate).toBe('2026-10-01');
  });

  it('edit mode with an unknown id shows the goal Not found screen', async () => {
    const app = await renderApp({ route: '/goals/nope/edit' });
    tc = app.tc;
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: en.notFound.goalTitle })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: en.notFound.goalAction })).toHaveAttribute('href', '/goals');
  });

  it('vi: no English leaks (create, every field in error, edit with hint and period error)', async () => {
    const user = userEvent.setup();
    const app = await renderApp({ route: '/goals/new', locale: 'vi' });
    tc = app.tc;
    expect(scanVi()).toEqual([]);
    await user.click(screen.getByRole('textbox', { name: /^Lý do/ }));
    await user.paste('a'.repeat(281));
    await user.type(screen.getByRole('textbox', { name: /^Phút mỗi ngày/ }), '0');
    await user.click(screen.getByRole('radio', { name: vi.goal.form.endsSpecific }));
    fireEvent.change(screen.getByLabelText(/^Ngày kết thúc/), { target: { value: '2026-01-01' } });
    await user.click(screen.getByRole('button', { name: vi.goal.form.save }));
    expect(screen.getByRole('alert')).toHaveTextContent('Cần sửa 4 ô nhập để lưu.');
    expect(document.getElementById('goal-name-err')).toHaveTextContent(vi.errors.GOAL_NAME_REQUIRED);
    expect(scanVi()).toEqual([]);

    const created = await tc.container.goalService.create(
      { name: 'Read', why: 'Be smarter', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' },
      new Date(),
    );
    if (!created.ok) throw new Error('setup');
    await tc.container.db.entries.put(buildEntry({ goalId: created.value.id, date: '2026-10-01', minutes: 30 }));
    await app.router.navigate(`/goals/${created.value.id}/edit`);
    await waitFor(() => expect(screen.getByRole('textbox', { name: /^Tên/ })).toHaveValue('Read'));
    expect(screen.getByText('Tổng cộng 930 phút (15,5 giờ) trong 31 ngày.')).toBeInTheDocument();
    expect(screen.getByText(/01\/10\/2026/)).toBeInTheDocument();
    const start = screen.getByLabelText(/^Ngày bắt đầu/);
    fireEvent.change(start, { target: { value: '2026-10-02' } });
    await user.click(screen.getByRole('button', { name: vi.goal.form.saveChanges }));
    await waitFor(() => expect(document.getElementById('goal-start-err')).toHaveTextContent(vi.errors.GOAL_PERIOD_EXCLUDES_ENTRIES));
    expect(scanVi()).toEqual([]);
    expect(screen.getByRole('textbox', { name: /^Tên/ })).toHaveValue('Read');
  });
});

// ---- v4.0 (M11-AC9, DESIGN S3 / §8.2): the third Ends radio, "No end date" ----
describe('GoalForm — No end date (M11-AC9, FR-01, FR-03, FR-56)', () => {
  const endsRadios = () => within(screen.getByRole('group', { name: en.goal.form.endsLegend })).getAllByRole('radio');
  const never = () => screen.getByRole('radio', { name: en.goal.form.endsNever });
  const status = () => screen.getByTestId('ends-status');

  it('the Ends group has 3 radios, the third labelled "No end date"; choosing it hides End date and the Target hint, shows its description, and saves endDate null', async () => {
    const user = userEvent.setup();
    const app = await renderApp({ route: '/goals/new' });
    tc = app.tc;
    expect(endsRadios().map((r) => r.getAttribute('value'))).toEqual(['thisYear', 'specific', 'never']);
    expect(never()).toBeEnabled();
    expect(never()).not.toBeChecked();
    expect(never()).not.toHaveAttribute('aria-describedby');
    await user.type(screen.getByRole('textbox', { name: /^Name/ }), 'Meditate');
    await user.type(screen.getByRole('textbox', { name: /^Minutes per day/ }), '10');
    fireEvent.change(screen.getByLabelText(/^Start date/), { target: { value: '2026-10-01' } });
    expect(screen.getByText("That's 920 min (15.3 h) over 92 days.")).toBeInTheDocument();
    await user.click(never());
    expect(never()).toBeChecked();
    expect(screen.queryByLabelText(/^End date/)).toBeNull();
    expect(screen.queryByText(/over 92 days/)).toBeNull();
    expect(screen.getByText(en.goal.form.endsNeverHint)).toBeInTheDocument();
    expect(never()).toHaveAccessibleDescription(en.goal.form.endsNeverHint);
    expect(status()).toHaveTextContent('');
    await user.click(screen.getByRole('button', { name: en.goal.form.save }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: en.goals.title })).toBeInTheDocument());
    const goals = await tc.container.db.goals.toArray();
    expect(goals).toHaveLength(1);
    expect(goals[0]).toMatchObject({ name: 'Meditate', targetType: 'daily', targetMinutes: 10, startDate: '2026-10-01', endDate: null });
    expect('endDate' in goals[0]).toBe(true);
    // Goals shows the open-ended row, in the Active group.
    expect(await screen.findByText('10 min/day · from 2026-10-01, no end date')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Active (1)' })).toBeInTheDocument();
  });

  it('the End date field sits right under "On a specific date" (before the third radio) and keeps its value when switching away and back', async () => {
    const user = userEvent.setup();
    const app = await renderApp({ route: '/goals/new' });
    tc = app.tc;
    await user.click(screen.getByRole('radio', { name: en.goal.form.endsSpecific }));
    const end = screen.getByLabelText(/^End date/);
    fireEvent.change(end, { target: { value: '2026-10-31' } });
    const group = screen.getByRole('group', { name: en.goal.form.endsLegend });
    const order = Array.from(group.querySelectorAll('input')).map((i) => i.id || i.value);
    expect(order).toEqual(['thisYear', 'specific', 'goal-end', 'never']);
    await user.click(never());
    expect(screen.queryByLabelText(/^End date/)).toBeNull();
    await user.click(screen.getByRole('radio', { name: en.goal.form.endsSpecific }));
    expect(screen.getByLabelText(/^End date/)).toHaveValue('2026-10-31');
  });

  it('Total hours: the third radio is disabled with the note always shown and linked by aria-describedby; the other two still work', async () => {
    const user = userEvent.setup();
    const app = await renderApp({ route: '/goals/new' });
    tc = app.tc;
    await user.click(screen.getByRole('radio', { name: en.goal.form.targetTotal }));
    expect(never()).toBeDisabled();
    expect(never()).toHaveAttribute('disabled');
    expect(screen.getByText(en.goal.form.endsNeverTotalNote)).toBeInTheDocument();
    expect(never()).toHaveAccessibleDescription(en.goal.form.endsNeverTotalNote);
    expect(endsRadios()).toHaveLength(3);
    await user.click(screen.getByRole('radio', { name: en.goal.form.endsSpecific }));
    expect(screen.getByRole('radio', { name: en.goal.form.endsSpecific })).toBeChecked();
    expect(screen.getByLabelText(/^End date/)).toBeInTheDocument();
    await user.click(never());
    expect(never()).not.toBeChecked();
    expect(status()).toHaveTextContent('');
    // Back to Minutes per day: unlocked, no note, nothing selected on its own.
    await user.click(screen.getByRole('radio', { name: en.goal.form.targetDaily }));
    expect(never()).toBeEnabled();
    expect(screen.queryByText(en.goal.form.endsNeverTotalNote)).toBeNull();
    expect(never()).not.toBeChecked();
  });

  it('"No end date" selected, then Target → Total hours: Ends moves to "This year", the status region announces it once, focus stays on Target; the form never saves total + null', async () => {
    const user = userEvent.setup();
    const app = await renderApp({ route: '/goals/new' });
    tc = app.tc;
    await user.type(screen.getByRole('textbox', { name: /^Name/ }), 'Spanish');
    await user.click(never());
    expect(never()).toBeChecked();
    const total = screen.getByRole('radio', { name: en.goal.form.targetTotal });
    await user.click(total);
    expect(screen.getByRole('radio', { name: 'This year — ends 2026-12-31' })).toBeChecked();
    expect(never()).not.toBeChecked();
    expect(never()).toBeDisabled();
    expect(status()).toHaveAttribute('role', 'status');
    expect(status()).toHaveAttribute('aria-live', 'polite');
    expect(status()).toHaveTextContent(en.goal.form.endsNeverSwitched);
    expect(total).toHaveFocus();
    expect(never()).toHaveAccessibleDescription(en.goal.form.endsNeverTotalNote);
    await user.type(screen.getByRole('textbox', { name: /^Total hours/ }), '100');
    await user.click(screen.getByRole('button', { name: en.goal.form.save }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: en.goals.title })).toBeInTheDocument());
    const goals = await tc.container.db.goals.toArray();
    expect(goals[0]).toMatchObject({ targetType: 'total', targetMinutes: 6000, endDate: '2026-12-31' });
    expect(goals.some((g) => g.targetType === 'total' && g.endDate === null)).toBe(false);
  });

  it('switching back to Minutes per day clears the announcement and does not re-select "No end date" (A-D53); picking any Ends radio also clears it', async () => {
    const user = userEvent.setup();
    const app = await renderApp({ route: '/goals/new' });
    tc = app.tc;
    await user.click(never());
    await user.click(screen.getByRole('radio', { name: en.goal.form.targetTotal }));
    expect(status()).toHaveTextContent(en.goal.form.endsNeverSwitched);
    await user.click(screen.getByRole('radio', { name: en.goal.form.targetDaily }));
    expect(status()).toHaveTextContent('');
    expect(never()).toBeEnabled();
    expect(never()).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'This year — ends 2026-12-31' })).toBeChecked();
    await user.click(never());
    await user.click(screen.getByRole('radio', { name: en.goal.form.targetTotal }));
    expect(status()).toHaveTextContent(en.goal.form.endsNeverSwitched);
    await user.click(screen.getByRole('radio', { name: en.goal.form.endsSpecific }));
    expect(status()).toHaveTextContent('');
  });

  it('edit mode: an open-ended goal opens with "No end date" checked; "On a specific date" starts at the end of the start year; back and forth saves correctly (A-53, A-D60)', async () => {
    const user = userEvent.setup();
    const app = await renderApp({ route: '/goals' });
    tc = app.tc;
    const created = await tc.container.goalService.create({ name: 'Meditate', why: '', targetType: 'daily', targetValue: 10, startDate: '2026-10-01', endDate: null }, new Date());
    if (!created.ok) throw new Error('setup');
    await tc.container.db.entries.put(buildEntry({ goalId: created.value.id, date: '2026-10-08', minutes: 20 }));
    await app.router.navigate(`/goals/${created.value.id}/edit`);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: en.goal.form.titleEdit })).toBeInTheDocument());
    await waitFor(() => expect(never()).toBeChecked());
    expect(screen.queryByLabelText(/^End date/)).toBeNull();
    expect(screen.getByText(en.goal.form.endsNeverHint)).toBeInTheDocument();
    expect(screen.queryByText(/over \d+ days/)).toBeNull();
    await user.click(screen.getByRole('radio', { name: en.goal.form.endsSpecific }));
    expect(screen.getByLabelText(/^End date/)).toHaveValue('2026-12-31');
    // An end date before the last entry is refused (GOAL_PERIOD_EXCLUDES_ENTRIES), the goal stays open-ended.
    fireEvent.change(screen.getByLabelText(/^End date/), { target: { value: '2026-10-07' } });
    await user.click(screen.getByRole('button', { name: en.goal.form.saveChanges }));
    await waitFor(() => expect(document.getElementById('goal-start-err')).toHaveTextContent(en.errors.GOAL_PERIOD_EXCLUDES_ENTRIES));
    expect((await tc.container.db.goals.get(created.value.id))?.endDate).toBeNull();
    fireEvent.change(screen.getByLabelText(/^End date/), { target: { value: '2026-10-31' } });
    await user.click(screen.getByRole('button', { name: en.goal.form.saveChanges }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: en.goals.title })).toBeInTheDocument());
    expect((await tc.container.db.goals.get(created.value.id))?.endDate).toBe('2026-10-31');
    expect(await screen.findByText('10 min/day · 2026-10-01 – 2026-10-31')).toBeInTheDocument();
    // And back to no end date.
    await app.router.navigate(`/goals/${created.value.id}/edit`);
    await waitFor(() => expect(screen.getByRole('radio', { name: en.goal.form.endsSpecific })).toBeChecked());
    await user.click(never());
    await user.click(screen.getByRole('button', { name: en.goal.form.saveChanges }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: en.goals.title })).toBeInTheDocument());
    expect((await tc.container.db.goals.get(created.value.id))?.endDate).toBeNull();
    expect(await screen.findByText('10 min/day · from 2026-10-01, no end date')).toBeInTheDocument();
  });

  it('keyboard: arrow keys move through the three radios (two when Total hours locks the third)', async () => {
    const user = userEvent.setup();
    const app = await renderApp({ route: '/goals/new' });
    tc = app.tc;
    const first = screen.getByRole('radio', { name: 'This year — ends 2026-12-31' });
    first.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: en.goal.form.endsSpecific })).toBeChecked();
    await user.keyboard('{ArrowDown}');
    expect(never()).toBeChecked();
    expect(never()).toHaveFocus();
    await user.click(screen.getByRole('radio', { name: en.goal.form.targetTotal }));
    expect(screen.getByRole('radio', { name: 'This year — ends 2026-12-31' })).toBeChecked();
    screen.getByRole('radio', { name: en.goal.form.endsSpecific }).focus();
    await user.keyboard('{ArrowDown}');
    // The disabled radio is skipped: the group wraps back to the first one.
    expect(never()).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'This year — ends 2026-12-31' })).toBeChecked();
  });

  it('vi: "Không có thời hạn", description and note in Vietnamese, announcement in Vietnamese, no English leaks', async () => {
    const user = userEvent.setup();
    const app = await renderApp({ route: '/goals/new', locale: 'vi' });
    tc = app.tc;
    const neverVi = screen.getByRole('radio', { name: 'Không có thời hạn' });
    expect(neverVi).toBeInTheDocument();
    await user.click(neverVi);
    expect(screen.getByText(vi.goal.form.endsNeverHint)).toBeInTheDocument();
    expect(scanVi()).toEqual([]);
    await user.click(screen.getByRole('radio', { name: vi.goal.form.targetTotal }));
    expect(neverVi).toBeDisabled();
    expect(screen.getByText(vi.goal.form.endsNeverTotalNote)).toBeInTheDocument();
    expect(status()).toHaveTextContent(vi.goal.form.endsNeverSwitched);
    expect(scanVi()).toEqual([]);
    await user.click(screen.getByRole('radio', { name: vi.goal.form.targetDaily }));
    await user.click(neverVi);
    await user.type(screen.getByRole('textbox', { name: /^Tên/ }), 'Thiền');
    await user.type(screen.getByRole('textbox', { name: /^Phút mỗi ngày/ }), '10');
    await user.click(screen.getByRole('button', { name: vi.goal.form.save }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: vi.goals.title })).toBeInTheDocument());
    expect(await screen.findByText('10 phút/ngày · từ 09/10/2026, không có thời hạn')).toBeInTheDocument();
    expect(scanVi()).toEqual([]);
  });
});
