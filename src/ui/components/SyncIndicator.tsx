import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { SyncStatus } from '../../domain/sync';
import type { MessageKey } from '../../i18n/types';
import type { AuthState } from '../../services/auth-service';
import { useFormat } from '../hooks/useFormat';
import { useNow } from '../hooks/useNow';
import { useT } from '../hooks/useT';
import { Icon, type IconName } from './Icon';

/** The six visible states of DESIGN §5 (priority: expired > signing-in > error > offline/pending > syncing > synced). */
export type IndicatorState = 'expired' | 'signing-in' | 'error' | 'offline' | 'pending' | 'syncing' | 'synced';

export function indicatorState(auth: AuthState, status: SyncStatus | null, online: boolean): IndicatorState | null {
  if (auth.kind === 'expired') return 'expired';
  if (auth.kind === 'signing-in') return 'signing-in';
  if (auth.kind !== 'signed-in') return null;
  const s = status ?? { kind: 'paused', pending: 0, lastSyncedAt: null };
  if (!online || s.kind === 'offline' || s.error === 'SYNC_OFFLINE') return 'offline';
  if (s.kind === 'error') return 'error';
  if (s.kind === 'syncing') return 'syncing';
  if (s.pending > 0) return 'pending';
  return 'synced';
}

/** Announcement debounce (DESIGN §8.1: gather state changes for 1 s, never repeat the same message). */
export const ANNOUNCE_DEBOUNCE_MS = 1000;
const ANNOUNCED: ReadonlySet<IndicatorState> = new Set(['error', 'offline', 'expired']);

export interface SyncIndicatorProps {
  auth: AuthState;
  status: SyncStatus | null;
  online: boolean;
  onRetry: () => void;
  /** Tests shorten the announcement debounce. */
  announceDebounceMs?: number;
}

/**
 * Chip in the StatusRow (FR-50, DESIGN §5 SyncIndicator, §8.1). Renders nothing when signed out.
 * The hidden live region announces only transitions into error/offline/expired and back to synced.
 */
export function SyncIndicator({ auth, status, online, onRetry, announceDebounceMs = ANNOUNCE_DEBOUNCE_MS }: SyncIndicatorProps) {
  const { t } = useT();
  const f = useFormat();
  const now = useNow();
  const state = indicatorState(auth, status, online);
  const [announce, setAnnounce] = useState('');
  const previous = useRef<IndicatorState | null>(null);
  const lastBad = useRef<IndicatorState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMessage = useRef('');

  useEffect(() => {
    const prev = previous.current;
    previous.current = state;
    if (state === null || prev === null) return; // first render / hidden: nothing to say
    if (state === prev) return;
    let key: MessageKey | null = null;
    if (ANNOUNCED.has(state)) {
      key = `sync.announce.${state}` as MessageKey;
      lastBad.current = state;
    } else if (state === 'synced' && lastBad.current !== null) {
      // Back to synced after error/offline/expired (an intermediate `syncing` is transparent).
      key = 'sync.announce.synced';
      lastBad.current = null;
    }
    if (timer.current !== null) clearTimeout(timer.current);
    if (!key) return;
    const message = t(key);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (message === lastMessage.current) return;
      lastMessage.current = message;
      setAnnounce(message);
    }, announceDebounceMs);
  }, [state, t, announceDebounceMs]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const live = (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="sync-announce">
      {announce}
    </div>
  );
  if (state === null) return live;

  const pending = status?.pending ?? 0;
  let icon: IconName;
  let text: string;
  let spin = false;
  switch (state) {
    case 'expired':
      icon = 'lockOpen';
      text = t('sync.indicator.expired');
      break;
    case 'signing-in':
      icon = 'sync';
      text = t('sync.indicator.signingIn');
      spin = true;
      break;
    case 'error':
      icon = 'warn';
      text = t('sync.indicator.error');
      break;
    case 'offline':
      icon = 'cloudOff';
      text = pending > 0 ? f.count('sync.indicator.offline', pending) : t('sync.indicator.offlineNone');
      break;
    case 'pending':
      icon = 'cloudDot';
      text = f.count('sync.indicator.waiting', pending);
      break;
    case 'syncing':
      icon = 'sync';
      text = t('sync.indicator.syncing');
      spin = true;
      break;
    default:
      icon = 'cloudCheck';
      text = status?.lastSyncedAt ? t('sync.indicator.synced', { time: f.syncedShort(status.lastSyncedAt, now) }) : t('sync.indicator.syncedNoTime');
  }
  const className = `sync ${state === 'pending' || state === 'offline' ? 'pending' : state}`;
  const iconEl = <Icon name={icon} className={spin ? 'ic spin' : 'ic'} />;

  let chip;
  if (state === 'expired') {
    chip = (
      <Link className={className} to="/settings" data-testid="sync-indicator" data-state={state}>
        {iconEl}
        <span>{text}</span>
      </Link>
    );
  } else {
    chip = (
      <span className={className} data-testid="sync-indicator" data-state={state}>
        {iconEl}
        <span>{text}</span>
        {state === 'error' ? (
          <button type="button" className="retry" aria-label={t('sync.indicator.retryAria')} onClick={onRetry}>
            <span>{t('sync.indicator.retry')}</span>
          </button>
        ) : null}
      </span>
    );
  }
  return (
    <>
      {chip}
      {live}
    </>
  );
}
