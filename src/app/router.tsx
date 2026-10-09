import { createHashRouter, createMemoryRouter, Navigate, type RouteObject } from 'react-router';
import { AppShell } from '../ui/components/AppShell';
import { GoalForm } from '../ui/screens/GoalForm';
import { Goals } from '../ui/screens/Goals';
import { NotFound } from '../ui/screens/NotFound';
import { Settings } from '../ui/screens/Settings';
import { Today } from '../ui/screens/Today';

/** Routes (ARCHITECTURE §5.1). M3–M5 add goal detail, day and review. */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/today" replace /> },
      { path: 'today', element: <Today /> },
      { path: 'goals', element: <Goals /> },
      { path: 'goals/new', element: <GoalForm /> },
      { path: 'goals/:id/edit', element: <GoalForm /> },
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
