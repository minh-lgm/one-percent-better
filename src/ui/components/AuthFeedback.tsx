import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useServices } from '../hooks/useServices';
import { useToast } from '../hooks/useToast';

/**
 * Toasts for the outcome of the OAuth round-trip (DESIGN F9), which lands while any screen
 * is showing: success → `toast.signedIn`; failure on a screen other than Settings → short
 * error toast + "Go to Account"; on Settings the Account card shows the full Alert (A4).
 * Uses `AuthService.onOutcome`, which replays an outcome that happened before this mounted
 * (bootstrap runs the callback before the first render). Renders nothing.
 */
export function AuthFeedback() {
  const { authService } = useServices();
  const toast = useToast();
  const navigate = useNavigate();
  const onSettings = useLocation().pathname === '/settings';
  const latest = useRef({ toast, navigate, onSettings });
  latest.current = { toast, navigate, onSettings };

  useEffect(
    () =>
      authService.onOutcome((outcome) => {
        const { toast: t, navigate: go, onSettings: here } = latest.current;
        if (outcome.kind === 'signed-in') {
          t.show('toast.signedIn', { email: outcome.email });
          return;
        }
        if (here) return;
        t.show(outcome.code === 'AUTH_CANCELLED' ? 'toast.signInCancelled' : 'toast.signInFailed', undefined, {
          tone: 'error',
          action: { key: 'settings.account.goTo', onClick: () => void go('/settings') },
        });
      }),
    [authService],
  );

  return null;
}
