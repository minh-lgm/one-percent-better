import { useId, type Ref } from 'react';
import type { AuthErrorCode } from '../../domain/types';
import type { AuthState } from '../../services/auth-service';
import { useT } from '../hooks/useT';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { GoogleSignInButton } from './GoogleSignInButton';
import { Icon } from './Icon';

export interface AccountCardProps {
  auth: Exclude<AuthState, { kind: 'unavailable' }>;
  online: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onDismissError: () => void;
  /** The h2 receives focus after signing out (DESIGN 8.1). */
  headingRef?: Ref<HTMLHeadingElement>;
  signInRef?: Ref<HTMLButtonElement>;
  signOutRef?: Ref<HTMLButtonElement>;
}

/** Settings card "Account" — states A1 … A5, A10 of DESIGN S7 (sync details arrive in M7). */
export function AccountCard({ auth, online, onSignIn, onSignOut, onDismissError, headingRef, signInRef, signOutRef }: AccountCardProps) {
  const { t, locale } = useT();
  const id = useId();
  const offlineHintId = `${id}-offline`;
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
        <div className="btn-row">
          <Button ref={signOutRef} variant="secondary" onClick={onSignOut}>
            {t('settings.account.signOut')}
          </Button>
        </div>
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
