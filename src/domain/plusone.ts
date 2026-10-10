// "+1%" feedback (FR-29): shown once per goal and day, the moment an entry
// makes the goal reach its daily target. The UI keeps the previous "met" set
// of the session; `shown` is the persisted `Settings.plusOneShown` map.
import type { ISODate } from './types';

/**
 * Goal ids that just crossed from "not met" to "met" today and have not had
 * their feedback yet. `previousMet === null` means "no previous snapshot"
 * (first render): nothing fires, so a reload never re-announces.
 */
export function newlyMetGoals(previousMet: ReadonlySet<string> | null, nowMet: ReadonlySet<string>, shown: Readonly<Record<string, ISODate>>, today: ISODate): string[] {
  if (previousMet === null) return [];
  const out: string[] = [];
  for (const id of nowMet) {
    if (!previousMet.has(id) && shown[id] !== today) out.push(id);
  }
  return out;
}

/** `plusOneShown` with `goalId → today`, dropping entries of other days (keeps the map small). */
export function markPlusOneShown(shown: Readonly<Record<string, ISODate>>, goalId: string, today: ISODate): Record<string, ISODate> {
  const next: Record<string, ISODate> = {};
  for (const [id, date] of Object.entries(shown)) if (date === today) next[id] = date;
  next[goalId] = today;
  return next;
}
