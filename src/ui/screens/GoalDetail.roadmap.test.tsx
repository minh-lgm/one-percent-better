// @vitest-environment jsdom
// M19-AC6 (FR-80, A-D92): Goal detail shows "Part of roadmap {title}" with the link when the goal is linked; D2 (Goals and
// Goal detail) names the roadmap; unlinked goals keep the pre-phase-8 DOM.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi as vitest } from 'vitest';
import { DexieRoadmapRepository } from '../../data/dexie/roadmap-repo';
import en from '../../i18n/resources/en.json';
import { datasetQ1, FIXED_NOW_Q1 } from '../../test/builders';
import { createTestContainer, type TestContainer } from '../../test/container';
import { renderApp, scanVi } from '../../test/render-with-locale';

let tc: TestContainer | undefined;

beforeEach(() => {
  vitest.setSystemTime(FIXED_NOW_Q1);
});
afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

async function withQ1(locale: 'en' | 'vi' = 'en') {
  tc = await createTestContainer({ locale, clock: () => FIXED_NOW_Q1 });
  const d = datasetQ1();
  await tc.container.db.goals.bulkPut(d.goals);
  await tc.container.db.entries.bulkPut(d.entries);
  await new DexieRoadmapRepository(tc.container.db, { clock: () => FIXED_NOW_Q1 }).putMany({ roadmaps: [d.roadmap], phases: d.phases, items: d.items, checkpoints: d.checkpoints });
  return tc;
}

describe('Goal detail ↔ roadmap (M19-AC6)', () => {
  it('gq: "Part of roadmap" + link to #/roadmaps/rq; D2 names "QPT 21 tuần"; confirming unlinks the roadmap', async () => {
    const user = userEvent.setup();
    await withQ1();
    const app = await renderApp({ route: '/goals/gq', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'QPT study' });
    const line = await screen.findByTestId('goal-roadmap');
    expect(line).toHaveTextContent('Part of roadmap QPT 21 tuần');
    expect(within(line).getByRole('link', { name: 'QPT 21 tuần' })).toHaveAttribute('href', '/roadmaps/rq');
    await user.click(screen.getByRole('button', { name: en.common.delete }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTestId('confirm-note')).toHaveTextContent('This goal is part of the roadmap "QPT 21 tuần". The roadmap stays, but it loses its link and shows study time as —.');
    expect(dialog).toHaveAccessibleDescription(/part of the roadmap "QPT 21 tuần"/);
    await user.click(within(dialog).getByRole('button', { name: en.goal.delete.confirm }));
    await waitFor(() => expect(app.router.state.location.pathname).toBe('/goals'));
    expect((await tc!.container.db.roadmaps.get('rq'))?.goalId).toBeNull();
  });

  it('vi: "Thuộc lộ trình" and the D2 paragraph in Vietnamese, no leaks', async () => {
    const user = userEvent.setup();
    await withQ1('vi');
    await renderApp({ route: '/goals/gq', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'QPT study' });
    expect(await screen.findByTestId('goal-roadmap')).toHaveTextContent('Thuộc lộ trình QPT 21 tuần');
    await user.click(screen.getByRole('button', { name: 'Xóa' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTestId('confirm-note')).toHaveTextContent('Mục tiêu này thuộc lộ trình "QPT 21 tuần". Lộ trình vẫn được giữ, nhưng sẽ mất liên kết và hiện giờ học là —.');
    expect(scanVi()).toEqual([]);
  });

  it('an unlinked goal (g1) shows no roadmap line and the old D2 (no note paragraph) — here and on the Goals list', async () => {
    const user = userEvent.setup();
    await withQ1();
    const app = await renderApp({ route: '/goals/g1', container: tc });
    await screen.findByRole('heading', { level: 1, name: 'Read' });
    // Give the lazy lookup time to settle: the line must stay absent.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('goal-roadmap')).toBeNull();
    await user.click(screen.getByRole('button', { name: en.common.delete }));
    let dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByTestId('confirm-note')).toBeNull();
    expect(dialog).toHaveTextContent('This permanently deletes the goal and its 8 entries.');
    await user.click(within(dialog).getByRole('button', { name: en.common.cancel }));
    app.unmount();

    await renderApp({ route: '/goals', container: tc });
    const gqRow = (await screen.findByRole('heading', { level: 3, name: 'QPT study' })).closest('li')!;
    await user.click(within(gqRow).getByRole('button', { name: en.common.delete }));
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTestId('confirm-note')).toHaveTextContent('part of the roadmap "QPT 21 tuần"');
    await user.click(within(dialog).getByRole('button', { name: en.common.cancel }));
    const readRow = screen.getByRole('heading', { level: 3, name: 'Read' }).closest('li')!;
    await user.click(within(readRow).getByRole('button', { name: en.common.delete }));
    dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toHaveAttribute('open'));
    expect(within(dialog).queryByTestId('confirm-note')).toBeNull();
  });
});
