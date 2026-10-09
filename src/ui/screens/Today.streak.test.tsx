import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import { buildEntry, buildGoal, datasetS1 } from '../../test/builders';
import { createTestContainer, type TestContainer } from '../../test/container';
import { renderApp, scanVi } from '../../test/render-with-locale';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

describe('Today streak chip (M4-T7, DESIGN S1)', () => {
  it('shows the overall current streak (S1: 8-day streak) and updates live', async () => {
    tc = await createTestContainer();
    const { goals, entries } = datasetS1();
    await tc.container.db.goals.bulkPut(goals);
    await tc.container.db.entries.bulkPut(entries);
    await renderApp({ route: '/today', container: tc });
    await screen.findByRole('heading', { level: 1, name: en.today.title });
    await waitFor(() => expect(screen.getByTestId('streak-chip')).toHaveTextContent('8-day streak'));
    await tc.container.db.entries.put(buildEntry({ id: 'now', goalId: 'g1', date: '2026-10-09', minutes: 30 }));
    await waitFor(() => expect(screen.getByTestId('streak-chip')).toHaveTextContent('9-day streak'));
  });

  it('is hidden when the streak is 0', async () => {
    tc = await createTestContainer();
    await tc.container.db.goals.put(buildGoal({ id: 'g1', name: 'Read' }));
    await renderApp({ route: '/today', container: tc });
    await screen.findByRole('article', { name: 'Read' });
    expect(screen.queryByTestId('streak-chip')).toBeNull();
  });

  it('vi: "Chuỗi 8 ngày", scan clean', async () => {
    tc = await createTestContainer({ locale: 'vi' });
    const { goals, entries } = datasetS1();
    await tc.container.db.goals.bulkPut(goals);
    await tc.container.db.entries.bulkPut(entries);
    await renderApp({ route: '/today', container: tc });
    await waitFor(() => expect(screen.getByTestId('streak-chip')).toHaveTextContent(vi.today.streak.replace('{{n}}', '8')));
    expect(scanVi()).toEqual([]);
  });
});
