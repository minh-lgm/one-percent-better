import { forwardRef } from 'react';
import { useT } from '../hooks/useT';

export interface AppleSignInButtonProps {
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  /** Full width below 640 px (default, DESIGN 3.5); on native always full width. */
  full?: boolean;
  describedBy?: string;
}

/**
 * The Apple logo glyph, monochrome, `currentColor` (black or white with the theme — HIG "Sign in with Apple").
 * Inline SVG, decorative. OQ-D28: a vector equivalent of Apple's glyph; swap for the official asset from
 * Apple Design Resources before App Review if the reviewer asks (same box, same colour rules).
 */
function AppleLogo() {
  return (
    <svg className="alogo" viewBox="0 0 170 170" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M150.4 130.3c-2.5 5.7-5.4 10.9-8.8 15.7-4.6 6.6-8.4 11.1-11.3 13.6-4.5 4.1-9.3 6.3-14.5 6.4-3.7 0-8.2-1.1-13.4-3.2-5.2-2.1-10-3.2-14.4-3.2-4.6 0-9.6 1.1-14.9 3.2-5.3 2.2-9.6 3.3-12.9 3.4-5 .2-9.9-2-14.8-6.6-3.1-2.7-7.1-7.4-11.9-14.1-5.1-7.2-9.4-15.5-12.7-25-3.6-10.2-5.4-20.1-5.4-29.7 0-11 2.4-20.4 7.1-28.3 3.7-6.4 8.7-11.4 14.9-15.1 6.2-3.7 12.9-5.6 20.1-5.7 3.9 0 9.1 1.2 15.5 3.6 6.4 2.4 10.5 3.6 12.3 3.6 1.3 0 5.9-1.4 13.6-4.3 7.3-2.6 13.5-3.7 18.5-3.3 13.7 1.1 24 6.5 30.8 16.2-12.2 7.4-18.3 17.8-18.2 31.1.1 10.4 3.9 19 11.3 25.9 3.4 3.2 7.1 5.7 11.3 7.4-.9 2.6-1.9 5.2-2.9 7.6zM119.1 6.7c0 8.2-3 15.9-9 23-7.2 8.4-16 13.3-25.5 12.5-.1-1-.2-2-.2-3.1 0-7.9 3.4-16.3 9.5-23.2 3-3.5 6.9-6.4 11.6-8.7 4.7-2.3 9.1-3.5 13.3-3.8.1 1.1.2 2.2.2 3.3z"
      />
    </svg>
  );
}

/**
 * "Sign in with Apple" per Apple's HIG (DESIGN 5 "Nút Sign in with Apple", M14): black on light, white on dark,
 * the glyph left of the only allowed label (`auth.signInApple`), 44 px tall, same type as the Google button.
 * The label is the accessible name; no `aria-label`.
 */
export const AppleSignInButton = forwardRef<HTMLButtonElement, AppleSignInButtonProps>(function AppleSignInButton({ onClick, busy = false, disabled = false, full = true, describedBy }, ref) {
  const { t } = useT();
  return (
    <button ref={ref} type="button" className={`abtn${full ? ' full' : ''}`} onClick={onClick} disabled={disabled || busy} aria-busy={busy || undefined} aria-describedby={describedBy} data-testid="apple-sign-in">
      <AppleLogo />
      <span>{busy ? t('auth.signingIn') : t('auth.signInApple')}</span>
    </button>
  );
});
