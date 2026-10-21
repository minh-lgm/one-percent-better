import { useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';
import { RouterProvider, type createHashRouter } from 'react-router';
import { ToastProvider } from '../ui/components/Toast';
import { ServicesProvider } from './AppContext';
import type { AppContainer } from './container';
import { ErrorBoundary } from './ErrorBoundary';

export interface AppProps {
  container: AppContainer;
  router: ReturnType<typeof createHashRouter>;
  /** Called once after the first commit (M13: hides the native launch image). */
  onFirstRender?: () => void;
}

export function App({ container, router, onFirstRender }: AppProps) {
  useEffect(() => {
    onFirstRender?.();
    // Only the first commit matters; a changed callback must not re-fire it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <I18nextProvider i18n={container.i18n}>
      <ErrorBoundary>
        <ServicesProvider container={container}>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </ServicesProvider>
      </ErrorBoundary>
    </I18nextProvider>
  );
}
