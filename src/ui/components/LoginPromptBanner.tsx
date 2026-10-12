import { useT } from '../hooks/useT';
import { Button } from './Button';
import { GoogleSignInButton } from './GoogleSignInButton';
import { Icon } from './Icon';

export interface LoginPromptBannerProps {
  onSignIn: () => void;
  onNotNow: () => void;
  /** The Google button is busy while the sign-in redirect is being prepared (A3). */
  busy?: boolean;
}

/**
 * Gentle sign-in suggestion on Today (FR-52, DESIGN S1 / F14 / 8.1). A plain `<section>`:
 * no dialog role, no live region, never takes focus, never covers the goals. Tone `promo`
 * (`--primary-soft`), icon inline with the title below 640 px, as its own column from 640 px.
 */
export function LoginPromptBanner({ onSignIn, onNotNow, busy = false }: LoginPromptBannerProps) {
  const { t } = useT();
  return (
    <section className="banner promo login-prompt" aria-label={t('loginPrompt.label')} data-testid="login-prompt-banner">
      <Icon name="cloudDot" />
      <div className="stack-t">
        <p className="title">{t('loginPrompt.title')}</p>
        <p>{t('loginPrompt.body')}</p>
        <div className="btn-row">
          <GoogleSignInButton onClick={onSignIn} busy={busy} full={false} />
          <Button variant="ghost" onClick={onNotNow} disabled={busy} data-testid="login-prompt-not-now">
            {t('loginPrompt.notNow')}
          </Button>
        </div>
      </div>
    </section>
  );
}
