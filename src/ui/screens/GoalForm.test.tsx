import { fireEvent, screen, waitFor } from '@testing-library/react';
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
    expect(screen.getByRole('status')).toHaveTextContent(en.toast.goalCreated);
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
