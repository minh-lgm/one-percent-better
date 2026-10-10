import { screen, waitFor, within } from '@testing-library/react';
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
  await tc.container.db.entries.bulkPut([...entries, buildEntry({ id: 'e-timer', goalId: 'g2', date: '2026-10-08', minutes: 5, note: 'Riff', source: 'timer', createdAt: '2026-10-08T12:00:00.000Z' })]);
  return tc;
}

describe('Goal detail (M3-AC5)', () => {
  it('shows header, info, Edit/Delete and the history newest first with sources', async () => {
    await withS1();
    await renderApp({ route: '/goals/g2', container: tc });
    expect(await screen.findByRole('heading', { level: 1, name: 'Guitar' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Guitar — 1% Better'));
    expect(screen.getByText(en.goal.status.active)).toBeInTheDocument();
    expect(screen.getByText('Play a full song by Christmas')).toBeInTheDocument();
    expect(screen.getByText('20 min/day · 2026-09-01 – 2026-12-31')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: en.common.edit })).toHaveAttribute('href', '/goals/g2/edit');
    expect(screen.getAllByRole('link', { name: en.nav.goals }).find((l) => l.classList.contains('back'))).toHaveAttribute('href', '/goals');
    expect(screen.getByRole('heading', { level: 2, name: en.goal.detail.historyTitle })).toBeInTheDocument();
    const rows = await screen.findAllByTestId('history-row');
    expect(rows).toHaveLength(14);
    const first = within(rows[0]).getAllByRole('cell').map((c) => c.textContent);
    // Same day: the later entry (timer, 12:00Z) comes before the earlier one.
    expect(first).toEqual(['2026-10-08', '5 min', 'Riff', en.entry.source.timer]);
    expect(within(rows[0]).getByRole('link', { name: '2026-10-08' })).toHaveAttribute('href', '/day/2026-10-08');
    expect(within(rows[1]).getAllByRole('cell').map((c) => c.textContent)).toEqual(['2026-10-08', '20 min', '—', en.entry.source.manual]);
    expect(within(rows[13]).getAllByRole('cell')[0]).toHaveTextContent('2026-09-01');
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([en.goal.detail.colDate, en.goal.detail.colMinutes, en.goal.detail.colNote, en.goal.detail.colSource]);
  });

  it('shows the empty history state for a goal without entries, and ended/upcoming badges', async () => {
    await withS1();
    const app = await renderApp({ route: '/goals/g4', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'Marathon prep' });
    expect(screen.getByText(en.goal.status.upcoming)).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 3, name: en.empty.detail.history })).toBeInTheDocument();
    expect(screen.getByText(en.empty.detail.historyBody)).toBeInTheDocument();
    expect(screen.queryByTestId('history')).toBeNull();
    app.unmount();
    await renderApp({ route: '/goals/g5', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'Old course' });
    expect(screen.getByText(en.goal.status.ended)).toBeInTheDocument();
  });

  it('unknown id → Not found (goal variant)', async () => {
    await withS1();
    await renderApp({ route: '/goals/khong-ton-tai', container: tc });
    expect(await screen.findByRole('heading', { level: 1, name: en.notFound.goalTitle })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: en.notFound.goalAction })).toHaveAttribute('href', '/goals');
  });

  it('Delete opens D2 and, once confirmed, removes the goal and returns to Goals', async () => {
    const user = userEvent.setup();
    await withS1();
    const app = await renderApp({ route: '/goals/g5', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'Old course' });
    await user.click(screen.getByRole('button', { name: en.common.delete }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Delete "Old course"?');
    expect(dialog).toHaveTextContent('This permanently deletes the goal and its 1 entry.');
    await user.click(within(dialog).getByRole('button', { name: en.common.cancel }));
    await waitFor(() => expect(screen.getByRole('button', { name: en.common.delete })).toHaveFocus());
    await user.click(screen.getByRole('button', { name: en.common.delete }));
    // M5-D1: no "Goal not found" may be rendered between Confirm and the Goals list.
    const seen: string[] = [];
    const observer = new MutationObserver(() => {
      for (const h of document.querySelectorAll('h1')) if (h.textContent === en.notFound.goalTitle) seen.push(h.textContent);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: en.goal.delete.confirm }));
    await waitFor(() => expect(app.router.state.location.pathname).toBe('/goals'));
    await screen.findByRole('heading', { level: 1, name: en.goals.title });
    observer.disconnect();
    expect(seen).toEqual([]);
    expect(await tc!.container.db.goals.get('g5')).toBeUndefined();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(en.toast.goalDeleted));
  });

  it('Goals list links each name to its detail page', async () => {
    await withS1();
    await renderApp({ route: '/goals', container: tc });
    expect(await screen.findByRole('link', { name: 'Read' })).toHaveAttribute('href', '/goals/g1');
  });

  it('renders user notes as literal text (M3-AC11)', async () => {
    await withS1();
    await tc!.container.db.entries.put(buildEntry({ id: 'xss', goalId: 'g1', date: '2026-10-08', minutes: 1, note: '<script>alert(1)</script>' }));
    await renderApp({ route: '/goals/g1', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'Read' });
    expect(await screen.findByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });

  it('vi: history and empty history have no English leaks; dates are dd/MM/yyyy', async () => {
    await withS1('vi');
    const app = await renderApp({ route: '/goals/g2', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'Guitar' });
    await waitFor(() => expect(document.title).toBe('Guitar — 1% Better'));
    expect(screen.getByText('20 phút/ngày · 01/09/2026 – 31/12/2026')).toBeInTheDocument();
    const rows = await screen.findAllByTestId('history-row');
    expect(within(rows[0]).getAllByRole('cell').map((c) => c.textContent)).toEqual(['08/10/2026', '5 phút', 'Riff', vi.entry.source.timer]);
    expect(within(rows[1]).getAllByRole('cell')[3]).toHaveTextContent(vi.entry.source.manual);
    expect(scanVi()).toEqual([]);
    app.unmount();
    await renderApp({ route: '/goals/g4', container: tc });
    await screen.findByRole('heading', { level: 3, name: vi.empty.detail.history });
    expect(scanVi()).toEqual([]);
  });
});
