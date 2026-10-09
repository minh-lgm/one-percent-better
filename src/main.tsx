import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { App } from './app/App';
import { bootstrap } from './app/bootstrap';
import { createContainer } from './app/container';
import { createAppRouter } from './app/router';
import { env } from './config/env';
import { registerServiceWorker } from './integration/sw-register';
import { StorageError } from './ui/screens/StorageError';
import './ui/styles/app.css';

const root = createRoot(document.getElementById('root') as HTMLElement);

async function start(): Promise<void> {
  const result = await bootstrap({
    navigatorLanguage: navigator.language,
    createContainer: (i18n) => createContainer({ i18n, dbName: env.dbName }),
  });

  if (!result.ok) {
    root.render(
      <StrictMode>
        <I18nextProvider i18n={result.i18n}>
          <StorageError onRetry={start} />
        </I18nextProvider>
      </StrictMode>,
    );
    return;
  }

  const { container } = result;
  root.render(
    <StrictMode>
      <App container={container} router={createAppRouter()} />
    </StrictMode>,
  );

  // Service worker only in production builds (ADR-06); dev server runs without it.
  if (import.meta.env.PROD) {
    void registerServiceWorker({
      swUrl: `${import.meta.env.BASE_URL}sw.js`,
      onUpdateAvailable: () => container.updates.notify(),
    }).then((handle) => container.updates.setHandle(handle));
  }
}

void start();
