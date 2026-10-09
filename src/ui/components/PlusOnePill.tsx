import { useT } from '../hooks/useT';
import { Icon } from './Icon';

export type PlusOneSrKey = 'goalCard.plusOneSrToday' | 'goalCard.plusOneSrDay';

/** The "+1%" pill shown when a goal met its daily target (DESIGN §5, §8). */
export function PlusOnePill({ srKey = 'goalCard.plusOneSrToday' }: { srKey?: PlusOneSrKey }) {
  const { t } = useT();
  return (
    <span className="plus" data-testid="plus-one">
      <Icon name="up" />
      {t('goalCard.plusOne')}
      <span className="sr-only"> {t(srKey)}</span>
    </span>
  );
}
