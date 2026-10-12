import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import type { MergePrompt } from '../../services/sync-service';
import { useFormat } from '../hooks/useFormat';
import { useServices } from '../hooks/useServices';
import { useSubscribable } from '../hooks/useSubscribable';
import { useToast } from '../hooks/useToast';
import { MergeAccountDialog } from './MergeAccountDialog';

const focusHeading = () => requestAnimationFrame(() => document.querySelector<HTMLElement>('main h1')?.focus());
const focusAccountOrHeading = () =>
  requestAnimationFrame(() => (document.getElementById('h-account') ?? document.querySelector<HTMLElement>('main h1'))?.focus());

/**
 * Sync side effects for the UI (M7): toasts for `merge-done` (DESIGN F11) and `prefs-applied`
 * (F13, shown in the new language), and the D5 merge dialog. Mounted once in the AppShell when
 * the build has cloud configuration.
 */
export function SyncFeedback() {
  const { syncService, authService } = useServices();
  const toast = useToast();
  const f = useFormat();
  const onSettings = useLocation().pathname === '/settings';
  const latest = useRef({ toast, f, onSettings });
  latest.current = { toast, f, onSettings };
  const prompt = useSubscribable<MergePrompt | null>(() => (syncService ? syncService.watchMergePrompt() : { subscribe: () => () => {} }), [syncService]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!syncService) return;
    return syncService.onEvent((e) => {
      const { toast: show, f: fmt } = latest.current;
      if (e.type === 'merge-done') show.show('toast.mergeDone', { goals: fmt.count('format.goalsCount', e.goals), entries: fmt.count('format.entriesCount', e.entries) });
      else if (e.type === 'prefs-applied') show.show('toast.prefsFromAccount');
    });
  }, [syncService]);

  if (!syncService) return null;
  const p = prompt.data ?? null;

  async function confirm() {
    if (!syncService || busy) return;
    setBusy(true);
    try {
      await syncService.confirmMerge();
      focusHeading();
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!syncService || busy) return;
    setBusy(true);
    try {
      syncService.cancelMerge();
      await authService.signOut({ keepData: true, preserveLastUserId: true });
      latest.current.toast.show('toast.signedOutKept');
      if (latest.current.onSettings) focusAccountOrHeading();
      else focusHeading();
    } finally {
      setBusy(false);
    }
  }

  return <MergeAccountDialog open={p !== null} goals={p?.goals ?? 0} entries={p?.entries ?? 0} email={p?.email ?? ''} busy={busy} onConfirm={() => void confirm()} onCancel={() => void cancel()} />;
}
