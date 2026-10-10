import { useEffect, useRef, useState } from 'react';
import { isValidReminderTime } from '../../domain/reminder';

export interface ReminderTimeFieldProps {
  id: string;
  label: string;
  /** Stored value (`HH:MM`). */
  value: string;
  disabled?: boolean;
  /** Called with every valid, different value as soon as it is typed/picked. */
  onCommit: (value: string) => Promise<void> | void;
  /** Called once the value has settled (debounced) or the field loses focus, for a single toast. */
  onSettled?: () => void;
  settleMs?: number;
  /** id(s) of the description (the ".ics" hint, DESIGN S7 / M5-AC13). */
  describedBy?: string;
}

/**
 * `<input type="time">` for the reminder time (M2-D1). While the field is focused
 * the input is driven by a local draft that mirrors whatever the browser reports
 * (including '' for a half-typed segment); React never writes the stored value
 * back mid-edit, so the browser's segment editing state is not reset. Valid values
 * are saved immediately; the stored value is only shown again when not editing.
 */
export function ReminderTimeField({ id, label, value, disabled = false, onCommit, onSettled, settleMs = 700, describedBy }: ReminderTimeFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const lastCommitted = useRef(value);
  const pendingToast = useRef(false);
  const settleTimer = useRef<number | null>(null);

  useEffect(() => {
    lastCommitted.current = value;
  }, [value]);

  useEffect(
    () => () => {
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    },
    [],
  );

  function settle() {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = null;
    if (pendingToast.current) {
      pendingToast.current = false;
      onSettled?.();
    }
  }

  function handleChange(next: string) {
    setDraft(next);
    if (!isValidReminderTime(next) || next === lastCommitted.current) return;
    lastCommitted.current = next;
    pendingToast.current = true;
    void onCommit(next);
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(settle, settleMs);
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input num time"
        type="time"
        step={60}
        value={draft ?? value}
        disabled={disabled}
        aria-describedby={describedBy}
        onFocus={() => setDraft(value)}
        onBlur={() => {
          setDraft(null);
          settle();
        }}
        onChange={(e) => handleChange(e.target.value)}
      />
    </div>
  );
}
