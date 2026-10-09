import { I18nextProvider } from 'react-i18next';
import { RouterProvider, type createHashRouter } from 'react-router';
import { ToastProvider } from '../ui/components/Toast';
import { ServicesProvider } from './AppContext';
import type { AppContainer } from './container';

export interface AppProps {
  container: AppContainer;
  router: ReturnType<typeof createHashRouter>;
}

export function App({ container, router }: AppProps) {
  return (
    <I18nextProvider i18n={container.i18n}>
      <ServicesProvider container={container}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </ServicesProvider>
    </I18nextProvider>
  );
}
