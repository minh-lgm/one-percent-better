// @vitest-environment jsdom
// M17-AC8 / AC9 (DESIGN v8.0 §3.1): five nav items in the fixed order, Big goals third, active on /roadmaps*.
import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import type { TestContainer } from '../../test/container';
import { renderApp, scanVi } from '../../test/render-with-locale';

let tc: TestContainer | undefined;
afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

describe('AppShell nav (v8.0)', () => {
  it('en: Today · Goals · Big goals · Review · Settings; Big goals links to /roadmaps and is current there', async () => {
    const r = await renderApp({ route: '/roadmaps' });
    tc = r.tc;
    const nav = await screen.findByRole('navigation', { name: en.nav.label });
    const items = within(nav).getAllByRole('link').filter((l) => l.classList.contains('item'));
    expect(items.map((l) => l.textContent)).toEqual([en.nav.today, en.nav.goals, en.nav.roadmaps, en.nav.review, en.nav.settings]);
    expect(items[2]).toHaveAttribute('href', '/roadmaps');
    expect(items[2]).toHaveAttribute('aria-current', 'page');
    expect(items[1]).not.toHaveAttribute('aria-current');
    expect(items[2].querySelector('svg')).not.toBeNull();
    expect(await screen.findByRole('heading', { level: 1, name: en.nav.roadmaps })).toBeInTheDocument();
    expect(document.title).toBe(en.doc.title.replace('{{page}}', en.nav.roadmaps));
  });

  it('vi: "Mục tiêu lớn" third; no leaks', async () => {
    const r = await renderApp({ route: '/today', locale: 'vi' });
    tc = r.tc;
    const nav = screen.getByRole('navigation', { name: vi.nav.label });
    const items = within(nav).getAllByRole('link').filter((l) => l.classList.contains('item'));
    expect(items.map((l) => l.textContent)).toEqual([vi.nav.today, vi.nav.goals, 'Mục tiêu lớn', vi.nav.review, vi.nav.settings]);
    expect(scanVi(nav)).toEqual([]);
  });
});
