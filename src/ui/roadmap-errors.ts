// Error → key mapping for the big-goals screens (v8.0, M17; DESIGN 7.9.0 / ARCH §4.8 j, v8.2). Lazy-only: this file is
// imported by the roadmap screens, never by the cold-load path (`ui/error-messages.ts` serves everything else), so
// the namespace lookup costs the Today bundle nothing. The roadmap namespace is tried first — for every code,
// `DATE_IN_FUTURE` and `GOAL_NOT_FOUND` included — then the unsuffixed namespace key, then the main `errors.*` key.
import type { DomainError } from '../domain/types';
import type { Formatters } from '../i18n/format';
import type { MessageKey, RoadmapMessageKey, TParams } from '../i18n/types';
import { errorMessage } from './error-messages';

export interface RoadmapErrorMessage {
  key: MessageKey | RoadmapMessageKey;
  params?: TParams;
}

/** Suffix of the `roadmap:errors.<CODE>_<suffix>` key for the codes that have variants (ARCH §5.4 v8.0). */
function suffixOf(error: DomainError): string | undefined {
  const p = error.params ?? {};
  switch (error.code) {
    case 'ROADMAP_NOT_FOUND':
    case 'ROADMAP_LIMIT_REACHED':
      return typeof p.kind === 'string' ? p.kind : undefined;
    case 'ROADMAP_TEXT_TOO_LONG':
      return error.field;
    case 'ROADMAP_DATE_INVALID':
    case 'ROADMAP_SCORE_INVALID':
      return typeof p.variant === 'string' ? p.variant : undefined;
    default:
      return undefined;
  }
}

/**
 * `exists` is `i18n.exists` (or any predicate over `roadmap:…` keys); without it the most specific namespace key is
 * returned. Numeric params (`max`, …) are formatted for the locale; `variant` / `kind` never reach the copy.
 */
export function roadmapErrorMessage(error: DomainError, f: Formatters, exists?: (key: string) => boolean): RoadmapErrorMessage {
  const suffix = suffixOf(error);
  const candidates = [...(suffix ? [`roadmap:errors.${error.code}_${suffix}`] : []), `roadmap:errors.${error.code}`] as RoadmapMessageKey[];
  const hit = exists ? candidates.find((k) => exists(k)) : candidates[0];
  if (!hit) return errorMessage(error, f);
  const params: TParams = {};
  for (const [k, v] of Object.entries(error.params ?? {})) {
    if (k === 'variant' || k === 'kind') continue;
    if (typeof v === 'number') params[k] = f.number(v);
    else if (typeof v === 'string') params[k] = v;
  }
  return Object.keys(params).length > 0 ? { key: hit, params } : { key: hit };
}
