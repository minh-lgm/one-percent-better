import { useT } from '../hooks/useT';
import { Icon } from './Icon';

export interface ReminderBannerProps {
  /** Goals not on target yet (≥ 1). */
  count: number;
  /** `HH:MM` reminder time. */
  time: string;
}

/** Non-blocking reminder on Today (FR-15, DESIGN S1). No close button; disappears when every goal is on target. */
export function ReminderBanner({ count, time }: ReminderBannerProps) {
  const { t } = useT();
  return (
    <div className="banner reminder" role="status" aria-label={t('reminder.bannerLabel')} data-testid="reminder-banner">
      <Icon name="bell" />
      <p>{t('reminder.banner', { count, time })}</p>
    </div>
  );
}
