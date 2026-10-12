import { useId, type Ref } from 'react';
import type { SyncStatus } from '../../domain/sync';
import type { AuthErrorCode } from '../../domain/types';
import type { AuthState } from '../../services/auth-service';
import { useFormat } from '../hooks/useFormat';
import { useNow } from '../hooks/useNow';
import { useT } from '../hooks/useT';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { GoogleSignInButton } from './GoogleSignInButton';
import { Icon } from './Icon';

export interface AccountCardProps {
  auth: Exclude<AuthState, { kind: 'unavailable' }>;
  online: boolean;
  /** M7: sync details for A5 … A9. `null` while nothing is known yet. */
  sync?: SyncStatus | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onDismissError: () => void;
  onSyncNow?: () => void;
  /** The h2 receives focus after signing out (DESIGN 8.1). */
  headingRef?: Ref<HTMLHeadingElement>;
  signInRef?: Ref<HTMLButtonElement>;
  signOutRef?: Ref<HTMLButtonElement>;
}

/** Settings card "Account" — states A1 … A10 of DESIGN S7 (sync details A5 … A9 from M7). */
export function AccountCard({ auth, online, sync = null, onSignIn, onSignOut, onDismissError, onSyncNow, headingRef, signInRef, signOutRef }: AccountCardProps) {
  const { t, locale } = useT();
  const f = useFormat();
  const now = useNow();
  const id = useId();
  const offlineHintId = `${id}-offline`;
  const offlineSyncId = `${id}-offline-sync`;
  const lastError: AuthErrorCode | undefined = auth.kind === 'signed-out' || auth.kind === 'expired' ? auth.lastError : undefined;

  const errorAlert = lastError ? (
    <div className="alert" role="alert" data-testid="auth-error">
      <Icon name="alert" />
      <div className="stack-t">
        <p>{t(`errors.${lastError}`)}</p>
        <div className="alert-actions">
          <Button variant="ghost" onClick={onDismissError}>
            {t('common.dismiss')}
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  const googleButton = (busy = false) => (
    <GoogleSignInButton ref={signInRef} onClick={onSignIn} busy={busy} disabled={!online} describedBy={!online ? offlineHintId : undefined} />
  );
  const offlineHint = !online ? (
    <p className="hint" id={offlineHintId} data-testid="offline-hint">
      {t('settings.account.offlineHint')}
    </p>
  ) : null;

  let body;
  if (auth.kind === 'signing-in') {
    body = (
      <>
        <div className="signing">
          <Icon name="sync" className="ic spin" />
          <div>
            <strong role="status">{t('settings.account.signingInStatus')}</strong>
            <p>{t('settings.account.signingInBody')}</p>
          </div>
        </div>
        <div className="btn-row">{googleButton(true)}</div>
      </>
    );
  } else if (auth.kind === 'signed-in') {
    const status: SyncStatus = sync ?? { kind: 'paused', pending: 0, lastSyncedAt: null };
    const syncing = status.kind === 'syncing';
    const syncError = status.kind === 'error' || (status.kind === 'offline' && status.error === 'SYNC_OFFLINE' && online) ? status.error : undefined;
    const syncNowBlocked = !online;
    body = (
      <>
        <div className="who">
          <Avatar name={auth.name} email={auth.email} locale={locale} />
          <div className="t">
            <p className="name" data-testid="account-name">
              {auth.name}
            </p>
            <p className="mail" data-testid="account-email">
              {auth.email}
            </p>
            <p className="mail">{t('settings.account.provider')}</p>
          </div>
        </div>
        {syncError ? (
          <div className="alert" role="alert" data-testid="sync-error">
            <Icon name="alert" />
            <div className="stack-t">
              <p>{t(`errors.${syncError}`)}</p>
              {status.nextRetryAt ? <p data-testid="next-retry">{t('settings.account.nextRetry', { time: f.clock(status.nextRetryAt) })}</p> : null}
            </div>
          </div>
        ) : null}
        <dl className="dl" data-testid="sync-details">
          <div>
            <dt>{t('settings.account.lastSynced')}</dt>
            <dd data-testid="last-synced">{status.lastSyncedAt ? f.syncedAt(status.lastSyncedAt, now) : t('settings.account.neverSynced')}</dd>
          </div>
          <div>
            <dt>{t('settings.account.pending')}</dt>
            <dd data-testid="pending-count">{f.count('format.changesCount', status.pending)}</dd>
          </div>
        </dl>
        {status.remoteInvalid ? (
          // One info line (DESIGN A9) whose wording tells the two cases apart (M7-P1): rows the cloud refused
          // live only on this device (export!), rows from the account that failed validation were skipped.
          <p className="hint info-line" data-testid="remote-invalid" data-reason={status.rejected ? (status.remoteSkipped ? 'both' : 'local') : 'remote'}>
            <Icon name="info" />
            <span>
              {status.rejected ? f.count('settings.account.localRejected', status.rejected) : null}
              {status.rejected && status.remoteSkipped ? ' ' : null}
              {!status.rejected || status.remoteSkipped ? t('errors.SYNC_REMOTE_INVALID') : null}
            </span>
          </p>
        ) : null}
        <p className="hint">{t('settings.account.syncedInfo')}</p>
        <div className="btn-row">
          <Button
            variant="secondary"
            icon="sync"
            onClick={() => {
              if (!syncing && !syncNowBlocked) onSyncNow?.();
            }}
            disabled={syncNowBlocked}
            aria-disabled={syncing || undefined}
            aria-describedby={!online ? offlineSyncId : undefined}
            data-testid="sync-now"
          >
            {syncing ? t('sync.indicator.syncing') : t('settings.account.syncNow')}
          </Button>
          <Button ref={signOutRef} variant="secondary" onClick={onSignOut}>
            {t('settings.account.signOut')}
          </Button>
        </div>
        {!online ? (
          <p className="hint" id={offlineSyncId} data-testid="offline-sync">
            {t('settings.account.offlineSync')}
          </p>
        ) : null}
      </>
    );
  } else if (auth.kind === 'expired') {
    body = (
      <>
        <div className="alert info" role="status" data-testid="auth-expired">
          <Icon name="lockOpen" />
          <div className="stack-t">
            <strong>{t('settings.account.expiredTitle')}</strong>
            <p>{t('errors.AUTH_SESSION_EXPIRED')}</p>
            <p data-testid="account-email">{t('settings.account.expiredAccount', { email: auth.email })}</p>
          </div>
        </div>
        {errorAlert}
        <div className="btn-row">
          {googleButton()}
          <Button ref={signOutRef} variant="secondary" onClick={onSignOut}>
            {t('settings.account.signOut')}
          </Button>
        </div>
        {offlineHint}
      </>
    );
  } else {
    body = (
      <>
        {errorAlert}
        <p className="desc">{t('settings.account.descSignedOut')}</p>
        <div className="btn-row">{googleButton()}</div>
        {offlineHint}
        <p className="hint">{t('settings.account.privacyNote')}</p>
      </>
    );
  }

  return (
    <section className="card account" aria-labelledby="h-account" data-testid="account-card" data-state={auth.kind}>
      <h2 id="h-account" tabIndex={-1} ref={headingRef}>
        {t('settings.account.title')}
      </h2>
      {body}
    </section>
  );
}
