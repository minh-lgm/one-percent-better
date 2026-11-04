// @vitest-environment jsdom
// M17-AC8 / AC9: the Big goals list (S11) with dataset Q1 in en and vi, the unlinked / deleted-goal variants, the
// empty state, and the vi scan (main resources + the `roadmap` namespace).
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi as vitest } from 'vitest';
import { DexieRoadmapRepository } from '../../data/dexie/roadmap-repo';
import { datasetQ1, FIXED_NOW_Q1, type Q1Variant } from '../../test/builders';
import { createTestContainer } from '../../test/container';
import type { TestContainer } from '../../test/container';
import { renderApp, scanVi } from '../../test/render-with-locale';

let tc: TestContainer | undefined;

beforeEach(() => {
  vitest.setSystemTime(FIXED_NOW_Q1);
});
afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

async function seed(locale: 'en' | 'vi', variant?: Q1Variant | 'none') {
  tc = await createTestContainer({ locale, clock: () => FIXED_NOW_Q1 });
  const d = datasetQ1(variant === 'none' ? undefined : variant);
  const db = tc.container.db;
  await db.goals.bulkPut(d.goals);
  await db.entries.bulkPut(d.entries);
  const roadmap = variant === 'none' ? { ...d.roadmap, goalId: null } : d.roadmap;
  await new DexieRoadmapRepository(db, { clock: () => FIXED_NOW_Q1 }).putMany({ roadmaps: [roadmap], phases: d.phases, items: d.items, checkpoints: d.checkpoints });
  return tc;
}

const row = async () => within(await screen.findByTestId('roadmap-row'));

describe('Roadmaps (S11, M17)', () => {
  it('en: one row with title, goal, 1/21, On track, 5.8 h of 16 h, 125 days left', async () => {
    await seed('en');
    await renderApp({ route: '/roadmaps', container: tc });
    expect(await screen.findByRole('heading', { level: 1, name: 'Big goals' })).toBeInTheDocument();
    const r = await row();
    expect(r.getByRole('heading', { level: 2 })).toHaveTextContent('QPT 21 tuần');
    expect(r.getByTestId('roadmap-goal')).toHaveTextContent('Goal: QPT study');
    expect(r.getByTestId('roadmap-progress')).toHaveTextContent('Done 1/21');
    expect(r.getByTestId('pace-chip')).toHaveTextContent('On track');
    expect(r.getByTestId('pace-chip')).toHaveAttribute('data-pace', 'onTrack');
    expect(r.getByTestId('roadmap-hours')).toHaveTextContent('Studied 5.8 h of 16 h');
    expect(r.getByTestId('roadmap-milestone')).toHaveTextContent('Thi QPT: 125 days left');
    expect(screen.getByRole('list', { name: 'Your roadmaps' })).toBeInTheDocument();
    expect(screen.getByText('Plans that run for weeks or months. Study time comes from the goal you link.')).toBeInTheDocument();
  });

  it('vi: the same row in Vietnamese (5,8 giờ / 16 giờ, Đúng tiến độ, còn 125 ngày); scan finds no English', async () => {
    await seed('vi');
    await renderApp({ route: '/roadmaps', container: tc });
    expect(await screen.findByRole('heading', { level: 1, name: 'Mục tiêu lớn' })).toBeInTheDocument();
    const r = await row();
    expect(r.getByTestId('roadmap-goal')).toHaveTextContent('Mục tiêu: QPT study');
    expect(r.getByTestId('roadmap-progress')).toHaveTextContent('Xong 1/21');
    expect(r.getByTestId('pace-chip')).toHaveTextContent('Đúng tiến độ');
    expect(r.getByTestId('roadmap-hours')).toHaveTextContent('Đã học 5,8 giờ / 16 giờ');
    expect(r.getByTestId('roadmap-milestone')).toHaveTextContent('Thi QPT: còn 125 ngày');
    expect(scanVi()).toEqual([]);
  });

  it('Q1e (goal deleted elsewhere) → "Linked goal was deleted" and "Study time: —"; unlinked → "No goal linked"', async () => {
    await seed('en', 'e');
    await renderApp({ route: '/roadmaps', container: tc });
    let r = await row();
    expect(r.getByTestId('roadmap-goal')).toHaveTextContent('Linked goal was deleted');
    expect(r.getByTestId('roadmap-hours')).toHaveTextContent('Study time: —');
    expect(r.getByTestId('roadmap-progress')).toHaveTextContent('Done 1/21');
    cleanup();
    await tc!.dispose();
    await seed('vi', 'none');
    await renderApp({ route: '/roadmaps', container: tc });
    r = await row();
    expect(r.getByTestId('roadmap-goal')).toHaveTextContent('Chưa liên kết mục tiêu');
    expect(r.getByTestId('roadmap-hours')).toHaveTextContent('Giờ học: —');
    expect(scanVi()).toEqual([]);
  });

  it('Q1b: "1 week behind" chip at warn level; the list re-renders when the roadmap changes (tick W1 → On track)', async () => {
    await seed('en', 'b');
    await renderApp({ route: '/roadmaps', container: tc });
    const r = await row();
    expect(r.getByTestId('pace-chip')).toHaveTextContent('1 week behind');
    expect(r.getByTestId('pace-chip')).toHaveClass('warn');
    const service = await tc!.container.loadRoadmapService();
    const res = await service.setItemDone('wq1', true, '2026-11-04');
    expect(res.ok).toBe(true);
    await waitFor(() => expect(r.getByTestId('pace-chip')).toHaveTextContent('On track'));
    expect(r.getByTestId('roadmap-progress')).toHaveTextContent('Done 1/21');
  });

  it('empty: the explanation only (no create buttons in M17), in both languages', async () => {
    tc = await createTestContainer({ locale: 'en', clock: () => FIXED_NOW_Q1 });
    await renderApp({ route: '/roadmaps', container: tc });
    const empty = await screen.findByTestId('roadmaps-empty');
    expect(empty).toHaveTextContent('No big goals yet');
    expect(empty).toHaveTextContent('Start empty, or load the 21-week QPT plan.');
    expect(within(empty).queryByRole('button')).toBeNull();
    expect(within(empty).queryByRole('link')).toBeNull();
    cleanup();
    await tc.dispose();
    tc = await createTestContainer({ locale: 'vi', clock: () => FIXED_NOW_Q1 });
    await renderApp({ route: '/roadmaps', container: tc });
    expect(await screen.findByTestId('roadmaps-empty')).toHaveTextContent('Chưa có mục tiêu lớn nào');
    expect(scanVi()).toEqual([]);
  });
});
