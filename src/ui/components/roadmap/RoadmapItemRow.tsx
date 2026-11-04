// S13 item row — checkbox, title, tags, meta, note, "Dates & note" (DESIGN v8.0 S13 "Phase / mục", "Quy tắc thao tác
// nhanh", §8.4 "Mục"; FR-73, A-81). Lazy-only (ADR-53). Every write goes to the parent (service); this row only keeps
// the drafts the user is typing so a re-render from the live query never moves focus or drops keystrokes.
import { useEffect, useId, useRef, useState } from 'react';
import { ITEM_NOTE_MAX } from '../../../config/constants';
import type { RoadmapItem } from '../../../domain/roadmap';
import { itemLabel, itemState, type ItemState } from '../../../domain/roadmap-progress';
import { Button } from '../Button';
import { Icon } from '../Icon';
import { useFormat } from '../../hooks/useFormat';
import { useT, type RoadmapTFn } from '../../hooks/useT';
import { useRoadmapErrors, type UiError } from './useRoadmapErrors';

export type ItemField = 'actualStart' | 'actualEnd' | 'note';

export interface ItemError {
  field: ItemField;
  error: UiError;
}

export interface RoadmapItemRowProps {
  item: RoadmapItem;
  /** The `currentItemId` of the overview ("This week" tag, opened by default). */
  isCurrent: boolean;
  weekBased: boolean;
  /** `null` when study time cannot be counted (no linked goal). */
  minutes: number | null;
  today: string;
  error: ItemError | null;
  onTick: (done: boolean) => void;
  onDate: (which: 'start' | 'end', value: string | null) => void;
  onNote: (note: string) => void;
}

/** Early / on time / late (+ studied) or in progress — the result tag of DESIGN S13. */
export function labelText(t: RoadmapTFn, item: RoadmapItem): { text: string; tone: 'early' | 'late' | 'neutral' } | null {
  const label = itemLabel(item);
  if (label === null) return null;
  if (label.kind === 'inProgress') return { text: t('tag.inProgress'), tone: 'neutral' };
  const base = label.kind === 'onTime' ? t('tag.onTime') : label.kind === 'early' ? t('tag.early', { count: label.days }) : t('tag.late', { count: label.days });
  const text = label.studiedDays === null ? base : t('tag.combine', { label: base, studied: t('tag.studied', { count: label.studiedDays }) });
  return { text, tone: label.kind === 'late' ? 'late' : label.kind === 'early' ? 'early' : 'neutral' };
}

const NOTE_DEBOUNCE_MS = 600;

export function RoadmapItemRow({ item, isCurrent, weekBased, minutes, today, error, onTick, onDate, onNote }: RoadmapItemRowProps) {
  const { t } = useT('roadmap');
  const f = useFormat();
  const errorText = useRoadmapErrors();
  const uid = useId();
  const titleId = `${uid}-title`;
  const detailsBtnId = `${uid}-details`;
  const detailsId = `${uid}-det`;
  const [open, setOpen] = useState(isCurrent);
  const state: ItemState = itemState(item, today);
  const label = labelText(t, item);

  // Note draft: saved on blur and after a short pause (TASKS M19-T2 "blur/debounce"); re-synced from the item when it
  // changes elsewhere and the textarea is not being edited.
  const [note, setNote] = useState(item.note);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<number | null>(null);
  const latest = useRef(item.note);
  // Derived during render (not in an effect): a live-query re-render outside React's act() would otherwise show the
  // stale draft until the passive effect ran.
  const [syncedNote, setSyncedNote] = useState(item.note);
  if (item.note !== syncedNote) {
    setSyncedNote(item.note);
    if (document.activeElement !== noteRef.current) {
      setNote(item.note);
      latest.current = item.note;
    }
  }
  const flush = (value: string) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    if (value !== latest.current) {
      latest.current = value;
      onNote(value);
    }
  };
  const changeNote = (value: string) => {
    setNote(value);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => flush(value), NOTE_DEBOUNCE_MS);
  };
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const fieldError = (field: ItemField) => (error && error.field === field ? errorText(error.error) : undefined);
  const hours = minutes === null ? t('noValue') : f.hoursShort(minutes);

  return (
    <div className={`rd-it${open ? ' open' : ''}`} id={`rm-item-${item.id}`} tabIndex={-1} data-testid="roadmap-item" data-item={item.id} data-state={state}>
      <label className="rd-cb">
        <input type="checkbox" checked={item.actualEnd !== null} aria-label={t('item.checkAria', { title: item.title })} data-testid="item-check" onChange={(e) => onTick(e.target.checked)} />
      </label>
      <div className="rd-it-body">
        <div className="rd-it-title" id={titleId}>
          {item.title}
        </div>
        {isCurrent || state === 'overdue' || label ? (
          <div className="rd-tags" data-testid="item-tags">
            {isCurrent ? <span className="rd-tag now">{t(weekBased ? 'tag.currentWeek' : 'tag.currentItem')}</span> : null}
            {state === 'overdue' ? <span className="rd-tag over">{t('tag.overdue')}</span> : null}
            {label ? (
              <span className={`rd-tag ${label.tone}`} data-testid="item-label">
                {label.text}
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="rd-it-meta num">
          {t('item.planned', { range: f.itemRange(item.plannedStart, item.plannedEnd) })} · <span className="sr-only">{t('item.hoursLabel')}: </span>
          <span data-testid="item-hours">{hours}</span>
        </div>
        {item.note ? (
          <div className="rd-it-note" data-testid="item-note">
            {item.note}
          </div>
        ) : null}
        <div className="rd-it-det">
          <Button variant="ghost" className="sm" id={detailsBtnId} aria-expanded={open} aria-controls={detailsId} aria-labelledby={`${detailsBtnId} ${titleId}`} onClick={() => setOpen((o) => !o)}>
            {t('item.details')}
          </Button>
        </div>
        {open ? (
          <div className="rd-det" id={detailsId} role="group" aria-labelledby={titleId}>
            <DateControl id={`${uid}-as`} label={t('item.actualStart')} value={item.actualStart} today={today} error={fieldError('actualStart')} todayAria={t('item.todayAriaStart', { title: item.title })} clearAria={t('item.clearAriaStart', { title: item.title })} onChange={(v) => onDate('start', v)} />
            <DateControl id={`${uid}-ae`} label={t('item.actualEnd')} value={item.actualEnd} today={today} error={fieldError('actualEnd')} todayAria={t('item.todayAriaEnd', { title: item.title })} clearAria={t('item.clearAriaEnd', { title: item.title })} onChange={(v) => onDate('end', v)} />
            <div className="rd-fld full">
              <div className="rd-lr">
                <label htmlFor={`${uid}-note`}>{t('item.noteLabel')}</label>
                <span className="rd-cnt num" aria-hidden="true">
                  {t('item.noteCounter', { n: f.number(note.length) })}
                </span>
              </div>
              <textarea
                id={`${uid}-note`}
                ref={noteRef}
                className="input"
                rows={2}
                maxLength={ITEM_NOTE_MAX + 40}
                placeholder={t('item.notePlaceholder')}
                value={note}
                aria-invalid={fieldError('note') ? true : undefined}
                aria-describedby={fieldError('note') ? `${uid}-note-err` : undefined}
                onChange={(e) => changeNote(e.target.value)}
                onBlur={(e) => flush(e.target.value)}
              />
              {fieldError('note') ? (
                <p id={`${uid}-note-err`} className="err" role="alert">
                  <Icon name="alert" />
                  <span>{fieldError('note')}</span>
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface DateControlProps {
  id: string;
  label: string;
  value: string | null;
  today: string;
  error?: string;
  todayAria: string;
  clearAria: string;
  onChange: (value: string | null) => void;
}

/** Actual start / end: `<input type="date">` + `Today` + `Clear` (DESIGN S13). A rejected date stays in the box with its error. */
function DateControl({ id, label, value, today, error, todayAria, clearAria, onChange }: DateControlProps) {
  const { t } = useT('roadmap');
  const [draft, setDraft] = useState(value ?? '');
  // The stored value changed (saved, cleared, synced): show it — unless the box holds a rejected value the user may fix.
  // Derived during render so the box is right in the same commit as the row (no effect race with the live query).
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    if (!error) setDraft(value ?? '');
  }
  return (
    <div className="rd-fld">
      <label htmlFor={id}>{label}</label>
      <div className="rd-in">
        <input
          id={id}
          type="date"
          className="input d num"
          value={draft}
          max={today}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            // A complete date saves at once; an emptied box saves on blur (typing a date passes through '' in some browsers).
            if (e.target.value !== '') onChange(e.target.value);
          }}
          onBlur={(e) => {
            if (e.target.value === '' && value !== null) onChange(null);
          }}
        />
        <Button variant="secondary" className="sm" aria-label={todayAria} onClick={() => onChange(today)}>
          {t('item.today')}
        </Button>
        <Button variant="ghost" className="sm" aria-label={clearAria} disabled={value === null && draft === ''} onClick={() => onChange(null)}>
          {t('item.clear')}
        </Button>
      </div>
      {error ? (
        <p id={`${id}-err`} className="err" role="alert">
          <Icon name="alert" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
