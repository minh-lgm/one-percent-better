import { useId } from 'react';
import { addDays, isValidISODate } from '../../domain/dates';
import type { ISODate } from '../../domain/types';
import { useT } from '../hooks/useT';
import { Button } from './Button';
import { Icon } from './Icon';

export interface DateNavProps {
  date: ISODate;
  today: ISODate;
  onChange: (date: ISODate) => void;
}

/**
 * Previous / date picker / Next (DESIGN S5). "Next day" is disabled on (or after)
 * today; the picker cannot go past today. Below 640 px the button labels are
 * icon-only (CSS) but keep their accessible names.
 */
export function DateNav({ date, today, onChange }: DateNavProps) {
  const { t } = useT();
  const id = useId();
  const atOrAfterToday = date >= today;
  return (
    <div className="datenav" role="group" aria-label={t('day.navLabel')}>
      <Button variant="secondary" icon="left" aria-label={t('day.prev')} onClick={() => onChange(addDays(date, -1))}>
        <span className="lbl">{t('day.prev')}</span>
      </Button>
      <label className="sr-only" htmlFor={`${id}-date`}>
        {t('day.dateLabel')}
      </label>
      <input
        id={`${id}-date`}
        className="input num"
        type="date"
        value={date}
        max={today}
        onChange={(e) => {
          const next = e.target.value;
          if (isValidISODate(next) && next <= today) onChange(next);
        }}
      />
      <span className="spacer" />
      <Button variant="secondary" aria-label={t('day.next')} disabled={atOrAfterToday} onClick={() => onChange(addDays(date, 1))}>
        <span className="lbl">{t('day.next')}</span>
        <Icon name="right" />
      </Button>
    </div>
  );
}
