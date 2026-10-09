import { useT } from '../hooks/useT';
import { Icon } from './Icon';

/** The "+1%" pill shown when a goal met its daily target (DESIGN §5, §8). */
export function PlusOnePill() {
  const { t } = useT();
  return (
    <span className="plus" data-testid="plus-one">
      <Icon name="up" />
      {t('goalCard.plusOne')}
      <span className="sr-only"> {t('goalCard.plusOneSrToday')}</span>
    </span>
  );
}
