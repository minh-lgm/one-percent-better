import { createHashRouter, createMemoryRouter, Navigate, type RouteObject } from 'react-router';
import { AppShell } from '../ui/components/AppShell';
import { Day } from '../ui/screens/Day';
import { GoalForm } from '../ui/screens/GoalForm';
import { Goals } from '../ui/screens/Goals';
import { NotFound } from '../ui/screens/NotFound';
import { Settings } from '../ui/screens/Settings';
import { Today } from '../ui/screens/Today';
import { ViewError } from '../ui/screens/ViewError';
import { RouteErrorFallback } from './ErrorBoundary';

/** Routes (ARCHITECTURE §5.1). Review and Goal detail are lazy-loaded (ADR-10, M5-T2). */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    // Render errors anywhere below → DESIGN S9 ErrorBoundary screen, never the router's default page.
    errorElement: <RouteErrorFallback />,
    children: [
      { index: true, element: <Navigate to="/today" replace /> },
      { path: 'today', element: <Today /> },
      { path: 'goals', element: <Goals /> },
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
      { path: 'settings', element: <Settings /> },
      { path: '*', element: <NotFound /> },
    ],
  },
];

export function createAppRouter() {
  return createHashRouter(routes);
}

export function createTestRouter(initialEntries: string[] = ['/today']) {
  return createMemoryRouter(routes, { initialEntries });
}
