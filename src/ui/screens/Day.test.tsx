import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import { buildEntry, datasetS1 } from '../../test/builders';
import { createTestContainer, type TestContainer } from '../../test/container';
import { renderApp, scanVi } from '../../test/render-with-locale';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

async function withS1(locale: 'en' | 'vi' = 'en') {
  tc = await createTestContainer({ locale });
  const { goals, entries } = datasetS1();
  await tc.container.db.goals.bulkPut(goals);
  await tc.container.db.entries.bulkPut(entries);
  return tc;
}

const VI_LONG_2026_10_08 = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(2026, 9, 8));

describe('Day (M3-AC1, AC2, AC3, AC4)', () => {
  it('lists the goals running on 2026-10-08 with entries, sources and the day heading', async () => {
    await withS1();
    await renderApp({ route: '/day/2026-10-08', container: tc });
    expect(await screen.findByRole('heading', { level: 1, name: en.day.title })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Day — 1% Better'));
    expect(screen.getByText('Thursday, October 8, 2026')).toBeInTheDocument();
    expect(screen.getByText(en.day.onlyRunning)).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: en.day.goalsLabel });
    const cards = within(list).getAllByRole('article');
    expect(cards.map((c) => within(c).getByRole('heading', { level: 2 }).textContent)).toEqual(['Read', 'Guitar', 'Spanish']);
    expect(within(cards[0]).getByText('30/30')).toBeInTheDocument();
    expect(within(cards[0]).getByTestId('plus-one')).toHaveTextContent('+1%');
    expect(within(cards[0]).getByRole('progressbar', { name: 'Read on 2026-10-08' })).toHaveAttribute('aria-valuetext', '30 of 30 minutes');
    expect(within(cards[0]).getByText(en.entry.source.manual)).toBeInTheDocument();
    expect(within(cards[0]).queryByText(en.entry.listTitle)).toBeNull();
    expect(within(cards[0]).queryByRole('button', { name: en.goalCard.startTimer })).toBeNull();
    expect(within(cards[2]).getByText('0/17')).toBeInTheDocument();
    expect(within(cards[2]).getByText(en.empty.day.noEntries)).toBeInTheDocument();
    expect(within(cards[2]).getByRole('button', { name: en.goalCard.addEntry })).toBeInTheDocument();
    const dateInput = screen.getByLabelText(en.day.dateLabel);
    expect(dateInput).toHaveValue('2026-10-08');
    expect(dateInput).toHaveAttribute('max', '2026-10-09');
    expect(screen.getByRole('button', { name: en.day.next })).toBeEnabled();
    expect(screen.getByRole('link', { name: en.day.goToToday })).toHaveAttribute('href', '/today');
  });

  it('M3-AC1: back-fills an entry for Guitar on 2026-10-05, edits and deletes it; the 1440 limit applies', async () => {
    const user = userEvent.setup();
    await withS1();
    await renderApp({ route: '/day/2026-10-05', container: tc });
    const guitar = await screen.findByRole('article', { name: 'Guitar' });
    await user.click(within(guitar).getByRole('button', { name: en.goalCard.addEntry }));
    const form = within(guitar).getByRole('form', { name: 'Add entry for Guitar on 2026-10-05' });
    expect(within(form).getByLabelText(/^Minutes/)).toHaveFocus();
    await user.type(within(form).getByLabelText(/^Minutes/), '30');
    await user.type(within(form).getByLabelText(/^Note/), 'Scales');
    await user.click(within(form).getByRole('button', { name: en.entry.form.save }));
    await waitFor(() => expect(within(guitar).getByText('30/20')).toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent(en.toast.entrySaved);
    const saved = await tc!.container.db.entries.filter((e) => e.note === 'Scales').toArray();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ goalId: 'g2', date: '2026-10-05', minutes: 30, source: 'manual' });

    await user.click(within(guitar).getByRole('button', { name: 'Edit entry: 30 min, Scales' }));
    const minutes = within(guitar).getByLabelText(/^Minutes/);
    await user.clear(minutes);
    await user.type(minutes, '1441');
    await user.click(within(guitar).getByRole('button', { name: en.entry.form.saveChanges }));
    expect(await screen.findByText(en.errors.ENTRY_MINUTES_INVALID)).toBeInTheDocument();
    await user.clear(minutes);
    await user.type(minutes, '10');
    await user.click(within(guitar).getByRole('button', { name: en.entry.form.saveChanges }));
    await waitFor(() => expect(within(guitar).getByText('10/20')).toBeInTheDocument());

    await user.click(within(guitar).getByRole('button', { name: en.goalCard.addEntry }));
    await user.type(within(guitar).getByLabelText(/^Minutes/), '1431');
    await user.click(within(guitar).getByRole('button', { name: en.entry.form.save }));
    expect(await screen.findByText('A goal can have at most 1,440 minutes in one day. You can add up to 1,430 more for this day.')).toBeInTheDocument();
    await user.click(within(guitar).getByRole('button', { name: en.common.cancel }));

    await user.click(within(guitar).getByRole('button', { name: 'Delete entry: 10 min, Scales' }));
    await user.click(within(guitar).getByRole('button', { name: en.common.delete }));
    await waitFor(() => expect(within(guitar).getByText('0/20')).toBeInTheDocument());
    expect(await tc!.container.db.entries.count()).toBe(23);
  });

  it('M3-AC3: only goals whose period contains the day are listed (ended goals included)', async () => {
    await withS1();
    const app = await renderApp({ route: '/day/2026-09-20', container: tc });
    const list = await screen.findByRole('list', { name: en.day.goalsLabel });
    expect(within(list).getAllByRole('article').map((c) => within(c).getByRole('heading', { level: 2 }).textContent)).toEqual(['Guitar', 'Spanish']);
    app.unmount();
    await renderApp({ route: '/day/2026-06-30', container: tc });
    const list2 = await screen.findByRole('list', { name: en.day.goalsLabel });
    expect(within(list2).getAllByRole('article').map((c) => within(c).getByRole('heading', { level: 2 }).textContent)).toEqual(['Spanish', 'Old course']);
    expect(within(list2).getByRole('article', { name: 'Old course' })).toHaveTextContent('15/15');
  });

  it('empty state when no goal was running on that day', async () => {
    await withS1();
    await renderApp({ route: '/day/2025-12-25', container: tc });
    expect(await screen.findByRole('heading', { level: 2, name: en.empty.day.noGoals })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: en.empty.day.noGoalsAction })).toHaveAttribute('href', '/goals');
  });

  it('M3-AC2: a future date shows the message, no forms, and Next is disabled on today', async () => {
    await withS1();
    const app = await renderApp({ route: '/day/2026-10-10', container: tc });
    expect(await screen.findByText(en.errors.DATE_IN_FUTURE)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: en.day.goalsLabel })).toBeNull();
    expect(screen.queryByRole('button', { name: en.goalCard.addEntry })).toBeNull();
    expect(screen.getByRole('button', { name: en.day.next })).toBeDisabled();
    expect(screen.getByRole('link', { name: en.day.goToToday })).toHaveAttribute('href', '/today');
    app.unmount();
    await renderApp({ route: '/day/2026-10-09', container: tc });
    await screen.findByRole('list', { name: en.day.goalsLabel });
    expect(screen.getByRole('button', { name: en.day.next })).toBeDisabled();
    expect(screen.getByRole('button', { name: en.day.prev })).toBeEnabled();
  });

  it('M3-AC4: invalid dates show the error screen with a link to Today', async () => {
    await withS1();
    for (const bad of ['abc', '2026-13-40', '2026-02-30']) {
      const app = await renderApp({ route: `/day/${bad}`, container: tc });
      expect(await screen.findByText(en.day.invalid)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: en.day.invalidAction })).toHaveAttribute('href', '/today');
      expect(screen.queryByRole('group', { name: en.day.navLabel })).toBeNull();
      app.unmount();
    }
  });

  it('Previous / Next / date picker navigate between days', async () => {
    const user = userEvent.setup();
    await withS1();
    const app = await renderApp({ route: '/day/2026-10-08', container: tc });
    await screen.findByText('Thursday, October 8, 2026');
    await user.click(screen.getByRole('button', { name: en.day.prev }));
    await waitFor(() => expect(screen.getByText('Wednesday, October 7, 2026')).toBeInTheDocument());
    expect(app.router.state.location.pathname).toBe('/day/2026-10-07');
    expect(screen.getByRole('button', { name: en.day.prev })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: en.day.next }));
    await waitFor(() => expect(screen.getByText('Thursday, October 8, 2026')).toBeInTheDocument());
    const picker = screen.getByLabelText(en.day.dateLabel);
    fireEvent.change(picker, { target: { value: '2026-09-15' } });
    await waitFor(() => expect(app.router.state.location.pathname).toBe('/day/2026-09-15'));
    // The picker never goes past today.
    fireEvent.change(picker, { target: { value: '2026-10-10' } });
    expect(app.router.state.location.pathname).toBe('/day/2026-09-15');
    await waitFor(() => expect(screen.getByRole('article', { name: 'Guitar' })).toHaveTextContent('10/20'));
  });

  it('vi: Day (default, no goals, goal without entries, future, invalid) has no English leaks and uses vi formats', async () => {
    const user = userEvent.setup();
    await withS1('vi');
    let app = await renderApp({ route: '/day/2026-10-08', container: tc });
    await screen.findByRole('list', { name: vi.day.goalsLabel });
    expect(screen.getByText(VI_LONG_2026_10_08)).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Ngày — 1% Better'));
    const spanish = screen.getByRole('article', { name: 'Spanish' });
    expect(within(spanish).getByText(vi.empty.day.noEntries)).toBeInTheDocument();
    expect(within(spanish).getByRole('progressbar', { name: 'Spanish ngày 08/10/2026' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Read' })).toHaveTextContent(vi.entry.source.manual);
    expect(scanVi()).toEqual([]);
    await user.click(within(spanish).getByRole('button', { name: vi.goalCard.addEntry }));
    expect(within(spanish).getByRole('form', { name: 'Thêm lần ghi cho Spanish ngày 08/10/2026' })).toBeInTheDocument();
    expect(scanVi()).toEqual([]);
    app.unmount();

    app = await renderApp({ route: '/day/2025-12-25', container: tc });
    await screen.findByRole('heading', { level: 2, name: vi.empty.day.noGoals });
    expect(scanVi()).toEqual([]);
    app.unmount();

    app = await renderApp({ route: '/day/2026-10-10', container: tc });
    await screen.findByText(vi.errors.DATE_IN_FUTURE);
    expect(scanVi()).toEqual([]);
    app.unmount();

    await renderApp({ route: '/day/abc', container: tc });
    await screen.findByText(vi.day.invalid);
    expect(scanVi()).toEqual([]);
  });
});

describe('Today links to the Day screen (M3-T1)', () => {
  it('shows the past-day link pointing at yesterday when there are goals', async () => {
    await withS1();
    await renderApp({ route: '/today', container: tc });
    await screen.findByRole('article', { name: 'Read' });
    expect(screen.getByRole('link', { name: en.today.pastDayLink })).toHaveAttribute('href', '/day/2026-10-08');
  });

  it('Today totals are not affected by a past-day entry', async () => {
    await withS1();
    await tc!.container.db.entries.put(buildEntry({ id: 'past', goalId: 'g2', date: '2026-10-05', minutes: 30 }));
    await renderApp({ route: '/today', container: tc });
    const guitar = await screen.findByRole('article', { name: 'Guitar' });
    expect(within(guitar).getByText('0/20')).toBeInTheDocument();
  });
});
