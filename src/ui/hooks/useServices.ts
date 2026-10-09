import { useContext } from 'react';
import { ServicesContext } from '../../app/AppContext';
import type { AppContainer } from '../../app/container';

export function useServices(): AppContainer {
  const container = useContext(ServicesContext);
  if (!container) throw new Error('useServices must be used inside <ServicesProvider>');
  return container;
}
