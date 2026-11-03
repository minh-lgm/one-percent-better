import type { ComponentType } from 'react';
import { createHashRouter, createMemoryRouter, Navigate, type RouteObject } from 'react-router';
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
}

/** Routes (ARCHITECTURE §5.1). Review, Goal detail, (M14) Settings and (v7.1) Goals are lazy-loaded (ADR-10, ADR-27). */
export function buildRoutes({ Settings }: RouteOptions = {}): RouteObject[] {
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

/** The app's routes (Settings lazy). Kept for the existing imports. */
export const routes: RouteObject[] = buildRoutes();

export function createAppRouter() {
  return createHashRouter(routes);
}

export function createTestRouter(initialEntries: string[] = ['/today'], options: RouteOptions = {}) {
  return createMemoryRouter(buildRoutes(options), { initialEntries });
}
