import { useT } from '../hooks/useT';
import { Icon } from './Icon';

export type PlusOneSrKey = 'goalCard.plusOneSrToday' | 'goalCard.plusOneSrDay';

/**
 * The "+1%" pill shown when a goal met its daily target (DESIGN §5, §8).
 * `animate` plays the short "entering" effect once (FR-29; off under reduced motion).
 */
export function PlusOnePill({ srKey = 'goalCard.plusOneSrToday', animate = false }: { srKey?: PlusOneSrKey; animate?: boolean }) {
  const { t } = useT();
  return (
    <span className={animate ? 'plus entering' : 'plus'} data-testid="plus-one" data-animate={animate || undefined}>
      <Icon name="up" />
      {t('goalCard.plusOne')}
      <span className="sr-only"> {t(srKey)}</span>
    </span>
  );
}
