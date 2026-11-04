import type { i18n } from 'i18next';
import type { ComponentType } from 'react';
import { createHashRouter, createMemoryRouter, Navigate, type RouteObject } from 'react-router';
import { ensureRoadmapNamespace } from '../i18n/roadmap-namespace';
import { AppShell } from '../ui/components/AppShell';
import { Day } from '../ui/screens/Day';
import { GoalForm } from '../ui/screens/GoalForm';
import { NotFound } from '../ui/screens/NotFound';
import { Today } from '../ui/screens/Today';
import { ViewError } from '../ui/screens/ViewError';
import { RouteErrorFallback } from './ErrorBoundary';

export interface RouteOptions {
  /**
   * v5.0 (M14, ADR-27): Settings is lazy in the app (its account/backup/delete-account UI is not on the cold-load
   * path of Today). Tests pass the component so the screen mounts synchronously, as before.
   */
  Settings?: ComponentType;
  /**
   * v8.0 (M17, ADR-53): the i18next instance whose lazy `roadmap` namespace is registered inside the `lazy()` of the
   * `#/roadmaps*` routes, so the strings are there before the screen renders (both languages at once).
   */
  i18n?: i18n;
}

/** Routes (ARCHITECTURE §5.1). Review, Goal detail, (M14) Settings, (v7.1) Goals and (v8.0) Big goals are lazy-loaded (ADR-10, ADR-27, ADR-53). */
export function buildRoutes({ Settings, i18n }: RouteOptions = {}): RouteObject[] {
  return [
    {
      path: '/',
      element: <AppShell />,
      // Render errors anywhere below → DESIGN S9 ErrorBoundary screen, never the router's default page.
      errorElement: <RouteErrorFallback />,
      children: [
        { index: true, element: <Navigate to="/today" replace /> },
        { path: 'today', element: <Today /> },
        {
          // v7.1: Goals computes each goal's "% vs. ideal" (plan + entries); keeping it off Today's cold-load path
          // holds the 230 kB budget (NFR-03) now that two typefaces ship with the app.
          path: 'goals',
          lazy: async () => {
            const { Goals } = await import('../ui/screens/Goals');
            return { Component: Goals };
          },
          errorElement: <ViewError />,
        },
        { path: 'goals/new', element: <GoalForm /> },
        { path: 'goals/:id/edit', element: <GoalForm /> },
        {
          path: 'goals/:id',
          lazy: async () => {
            const { GoalDetail } = await import('../ui/screens/GoalDetail');
            return { Component: GoalDetail };
          },
          errorElement: <ViewError />,
        },
        {
          // v8.0 (M17): screen chunk and the `roadmap` namespace load together; the screen never renders without its strings.
          path: 'roadmaps',
          lazy: async () => {
            const [{ Roadmaps }] = await Promise.all([import('../ui/screens/Roadmaps'), i18n ? ensureRoadmapNamespace(i18n) : Promise.resolve()]);
            return { Component: Roadmaps };
          },
          errorElement: <ViewError />,
        },
        { path: 'day/:date', element: <Day /> },
        {
          path: 'review',
          lazy: async () => {
            const { Review } = await import('../ui/screens/Review');
            return { Component: Review };
          },
          errorElement: <ViewError />,
        },
        Settings
          ? { path: 'settings', element: <Settings /> }
          : {
              path: 'settings',
              lazy: async () => {
                const { Settings: Screen } = await import('../ui/screens/Settings');
                return { Component: Screen };
              },
              errorElement: <ViewError />,
            },
        { path: '*', element: <NotFound /> },
      ],
    },
  ];
}

/** The app's routes (Settings lazy, no i18n instance — kept for the existing imports; `createAppRouter` builds its own). */
export const routes: RouteObject[] = buildRoutes();

export function createAppRouter(i18n?: i18n) {
  return createHashRouter(i18n ? buildRoutes({ i18n }) : routes);
}

export function createTestRouter(initialEntries: string[] = ['/today'], options: RouteOptions = {}) {
  return createMemoryRouter(buildRoutes(options), { initialEntries });
}
