import { useEffect, type Ref } from 'react';
import type { AuthProvider } from '../../services/auth-port';
import { useServices } from '../hooks/useServices';
import { AppleSignInButton } from './AppleSignInButton';
import { GoogleSignInButton } from './GoogleSignInButton';

export interface SignInButtonsProps {
  onSignIn: (provider: AuthProvider) => void;
  /** A sign-in is in progress: the button that started it shows `Signing in…`, the other one is disabled (DESIGN A3). */
  busy?: boolean;
  /** Offline (DESIGN A2): both disabled, the reason attached to both. */
  disabled?: boolean;
  describedBy?: string;
  /** Full width below 640 px (default); on native always full width. */
  full?: boolean;
  /** The first button in reading order (Apple on iOS, else Google) — focus target after a dismissed error. */
  firstRef?: Ref<HTMLButtonElement>;
}

/**
 * Which button was tapped last, so A3 keeps it busy while the other is disabled. Module-level on purpose: the
 * card re-renders its `signing-in` layout at another tree position (the group remounts), and the Today banner
 * and the Settings card are different instances; forgotten once no sign-in is in progress.
 */
let lastTapped: AuthProvider | null = null;

/**
 * The sign-in button group shared by the Account card, LoginPromptBanner and ExportSignInHint (DESIGN 5
 * `SignInButtons`, M14): Sign in with Apple ABOVE Sign in with Google on iOS (`capabilities.appleSignIn`),
 * stacked, same width, 12 px apart; on the web and Android only the Google button, exactly as in v2.
 */
export function SignInButtons({ onSignIn, busy = false, disabled = false, describedBy, full = true, firstRef }: SignInButtonsProps) {
  const { capabilities } = useServices();
  const apple = capabilities.appleSignIn;
  useEffect(() => {
    if (!busy) lastTapped = null;
  }, [busy]);
  const busyProvider: AuthProvider | null = busy ? (lastTapped ?? (apple ? 'apple' : 'google')) : null;
  const click = (provider: AuthProvider) => {
    lastTapped = provider;
    onSignIn(provider);
  };
  const google = (
    <GoogleSignInButton
      ref={apple ? undefined : firstRef}
      onClick={() => click('google')}
      busy={busyProvider === 'google'}
      disabled={disabled || (busy && busyProvider !== 'google')}
      describedBy={describedBy}
      full={full}
    />
  );
  if (!apple) return google;
  return (
    <div className="signin-buttons" data-testid="sign-in-buttons">
      <AppleSignInButton ref={firstRef} onClick={() => click('apple')} busy={busyProvider === 'apple'} disabled={disabled || (busy && busyProvider !== 'apple')} describedBy={describedBy} full={full} />
      {google}
    </div>
  );
}
