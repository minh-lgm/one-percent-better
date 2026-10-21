import { I18nextProvider } from 'react-i18next';
import { RouterProvider, type createHashRouter } from 'react-router';
import { ToastProvider } from '../ui/components/Toast';
import { ServicesProvider } from './AppContext';
import type { AppContainer } from './container';
import { ErrorBoundary } from './ErrorBoundary';
import { FirstRenderSignal } from './FirstRenderSignal';

export interface AppProps {
  container: AppContainer;
  router: ReturnType<typeof createHashRouter>;
  /** Called once after the first commit (M13: hides the native launch image). */
  onFirstRender?: () => void;
}

export function App({ container, router, onFirstRender }: AppProps) {
  return (
    <I18nextProvider i18n={container.i18n}>
      {onFirstRender && <FirstRenderSignal onFirstRender={onFirstRender} />}
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
