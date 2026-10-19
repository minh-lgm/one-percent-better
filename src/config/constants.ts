// Business limits (PRD FR-01, FR-02, FR-07; ARCHITECTURE §4).
export const GOAL_NAME_MAX = 60;
export const GOAL_WHY_MAX = 280;
export const DAILY_MINUTES_MIN = 1;
export const DAILY_MINUTES_MAX = 1440;
export const TOTAL_HOURS_MIN = 1;
export const TOTAL_HOURS_MAX = 10000;
/** Longest period of a goal WITH an end date; open-ended goals (`endDate = null`, v4.0) have no limit (A-49). */
export const PERIOD_DAYS_MAX = 1827;
/**
 * v4.0 (M11, ADR-31 / ARCH §4.6 d): upper bound used ONLY by the in-memory entry range query of
 * `goalsDateRange` when some goal is open-ended. Never stored, exported or sent to the cloud.
 */
export const OPEN_END_QUERY_MAX = '9999-12-31';

export const ENTRY_MINUTES_MIN = 1;
export const ENTRY_MINUTES_MAX = 1440;
export const ENTRY_NOTE_MAX = 280;
export const DAY_MINUTES_LIMIT = 1440;

export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
/** Soft-deleted rows older than this are hard-deleted locally when nobody can still need them (ADR-29, M10). */
export const TOMBSTONE_RETENTION_DAYS = 30;
/**
 * v4.0 (M11, ADR-33): bump when a cloud schema change makes rows an older client skipped readable
 * again. A device whose kv `sync.pullResetVersion` is lower resets its `cursor.goals` once and
 * re-pulls the whole goals table on its next cycle.
 */
export const PULL_RESET_VERSION = 1;
/** Record id length accepted everywhere (backup importer, cloud mapper, SQL `check (char_length(id) between 1 and 64)`). */
export const ID_MAX = 64;

/** Delay before showing a loading skeleton, to avoid flicker (DESIGN §4). */
export const LOADING_DELAY_MS = 150;
/** Toast auto-hide duration (DESIGN §5). */
export const TOAST_DURATION_MS = 4000;
/** Error toasts with an action stay longer (DESIGN 5: Toast tone error, 8 s). */
export const TOAST_ERROR_DURATION_MS = 8000;
