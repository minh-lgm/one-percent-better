import { useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useServices } from '../hooks/useServices';
import { useT } from '../hooks/useT';
import { AuthFeedback } from './AuthFeedback';
import { Icon, type IconName } from './Icon';
import { OfflineChip } from './OfflineChip';
import { ToastRegion } from './Toast';
import { UpdateToast } from './UpdateToast';

const TABS: Array<{ to: string; icon: IconName; key: 'nav.today' | 'nav.goals' | 'nav.review' | 'nav.settings' }> = [
  { to: '/today', icon: 'today', key: 'nav.today' },
  { to: '/goals', icon: 'goals', key: 'nav.goals' },
  { to: '/review', icon: 'review', key: 'nav.review' },
  { to: '/settings', icon: 'settings', key: 'nav.settings' },
];

/** Skip link, tab bar (< 1024 px) / sidebar (≥ 1024 px), main region, toasts. */
export function AppShell() {
  const { t } = useT();
  const { authService } = useServices();
  const mainRef = useRef<HTMLElement>(null);
  // Review uses the 960 px column (DESIGN §3.2 / S6, mockup 06 `main.wide`) so the 53-week heatmap fits on desktop.
  const wide = useLocation().pathname.startsWith('/review');
  return (
    <>
      <a
        className="skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          mainRef.current?.focus();
        }}
      >
        {t('a11y.skip')}
      </a>
      <nav className="nav" aria-label={t('nav.label')}>
        <NavLink className="brand" to="/today" aria-label={t('app.name')}>
          <span className="mark" aria-hidden="true">
            1%
          </span>
          <span>{t('app.brandSuffix')}</span>
        </NavLink>
        {TABS.map((tab) => (
          <NavLink key={tab.to} className="item" to={tab.to}>
            <Icon name={tab.icon} />
            <span>{t(tab.key)}</span>
          </NavLink>
        ))}
      </nav>
      <div className="content">
        <main id="main" ref={mainRef} tabIndex={-1} className={wide ? 'wide' : undefined}>
          <OfflineChip />
          <Outlet />
        </main>
      </div>
      <ToastRegion />
      <UpdateToast />
      {authService.isAvailable() ? <AuthFeedback /> : null}
    </>
  );
}
