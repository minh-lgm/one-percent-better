import { createContext, type ReactNode } from 'react';
import type { AppContainer } from './container';

export const ServicesContext = createContext<AppContainer | null>(null);

export function ServicesProvider({ container, children }: { container: AppContainer; children: ReactNode }) {
  return <ServicesContext.Provider value={container}>{children}</ServicesContext.Provider>;
}
