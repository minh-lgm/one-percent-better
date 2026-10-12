import { useOnline } from '../hooks/useOnline';
import { useServices } from '../hooks/useServices';
import { useSubscribable } from '../hooks/useSubscribable';
import { useT } from '../hooks/useT';
import { OfflineChip } from './OfflineChip';
import { SyncIndicator } from './SyncIndicator';

/**
 * Top of `<main>` on every screen (DESIGN §3.1 StatusRow, A-D20). Signed out / cloud off: only the
 * OfflineChip when offline, no row otherwise (phase-1 layout untouched). Signing in, signed in or
 * expired: a fixed-height row with the SyncIndicator (plus the OfflineChip when expired + offline).
 */
export function StatusRow() {
  const { t } = useT();
  const { authService, syncService } = useServices();
  const online = useOnline();
  const auth = useSubscribable(() => authService.watch(), [authService]);
  const authState = auth.data ?? authService.state();
  const status = useSubscribable(() => (syncService ? syncService.watchStatus() : { subscribe: () => () => {} }), [syncService]);
  const shown = authState.kind === 'signing-in' || authState.kind === 'signed-in' || authState.kind === 'expired';
  if (!syncService || !shown) return <OfflineChip />;
  return (
    <div className="status-row" role="group" aria-label={t('sync.indicator.label')} data-testid="status-row">
      {authState.kind === 'expired' && !online ? <OfflineChip /> : null}
      <SyncIndicator auth={authState} status={status.data ?? syncService.current()} online={online} onRetry={() => void syncService.syncNow('manual')} />
    </div>
  );
}
