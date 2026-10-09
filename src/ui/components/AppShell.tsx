import { useRef } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useT } from '../hooks/useT';
import { Icon, type IconName } from './Icon';
import { OfflineChip } from './OfflineChip';
import { ToastRegion } from './Toast';
import { UpdateToast } from './UpdateToast';

const TABS: Array<{ to: string; icon: IconName; key: 'nav.today' | 'nav.goals' | 'nav.settings' }> = [
  { to: '/today', icon: 'today', key: 'nav.today' },
  { to: '/goals', icon: 'goals', key: 'nav.goals' },
  { to: '/settings', icon: 'settings', key: 'nav.settings' },
];

/** Skip link, tab bar (< 1024 px) / sidebar (≥ 1024 px), main region, toasts. */
export function AppShell() {
  const { t } = useT();
  const mainRef = useRef<HTMLElement>(null);
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
        <main id="main" ref={mainRef} tabIndex={-1}>
          <OfflineChip />
          <Outlet />
        </main>
      </div>
      <ToastRegion />
      <UpdateToast />
    </>
  );
}
