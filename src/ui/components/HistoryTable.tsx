import { Link } from 'react-router';
import type { LogEntry } from '../../domain/types';
import { useFormat } from '../hooks/useFormat';
import { useT } from '../hooks/useT';

/** Newest first: by date, then by creation time (ties within a day). */
export function sortHistory(entries: readonly LogEntry[]): LogEntry[] {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

/** Goal detail history (FR-18, DESIGN S4): date (link to Day), minutes, note, source. */
export function HistoryTable({ entries }: { entries: readonly LogEntry[] }) {
  const { t } = useT();
  const f = useFormat();
  return (
    <table className="hist" data-testid="history">
      <thead>
        <tr>
          <th scope="col">{t('goal.detail.colDate')}</th>
          <th scope="col">{t('goal.detail.colMinutes')}</th>
          <th scope="col">{t('goal.detail.colNote')}</th>
          <th scope="col">{t('goal.detail.colSource')}</th>
        </tr>
      </thead>
      <tbody>
        {sortHistory(entries).map((entry) => (
          <tr key={entry.id} data-testid="history-row">
            <td className="num">
              <Link to={`/day/${entry.date}`}>{f.dateShort(entry.date)}</Link>
            </td>
            <td className="num">{f.minutes(entry.minutes)}</td>
            <td className="note">{entry.note || t('common.emptyValue')}</td>
            <td className="src">{t(`entry.source.${entry.source}`)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
