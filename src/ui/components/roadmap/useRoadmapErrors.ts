// Error text for the big-goals screens (DESIGN 7.9.0 / A-D91): `roadmap:errors.*` first, main `errors.*` as the fallback.
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { DomainError } from '../../../domain/types';
import type { MessageKey } from '../../../i18n/types';
import { WRITE_FAILED_KEY } from '../../error-messages';
import { useFormat } from '../../hooks/useFormat';
import { roadmapErrorMessage } from '../../roadmap-errors';

/** `'write'` = a storage failure (not a DomainError): `errors.WRITE_FAILED` of the main resources. */
export type UiError = DomainError | 'write';

export function useRoadmapErrors(): (error: UiError) => string {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  return useCallback(
    (error: UiError) => {
      if (error === 'write') return String(t(WRITE_FAILED_KEY));
      const m = roadmapErrorMessage(error, f, (key) => i18n.exists(key));
      return String(t(m.key as MessageKey, m.params as never));
    },
    [t, i18n, f],
  );
}
