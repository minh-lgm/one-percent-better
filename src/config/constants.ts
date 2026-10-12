// Business limits (PRD FR-01, FR-02, FR-07; ARCHITECTURE §4).
export const GOAL_NAME_MAX = 60;
export const GOAL_WHY_MAX = 280;
export const DAILY_MINUTES_MIN = 1;
export const DAILY_MINUTES_MAX = 1440;
export const TOTAL_HOURS_MIN = 1;
export const TOTAL_HOURS_MAX = 10000;
export const PERIOD_DAYS_MAX = 1827;

export const ENTRY_MINUTES_MIN = 1;
export const ENTRY_MINUTES_MAX = 1440;
export const ENTRY_NOTE_MAX = 280;
export const DAY_MINUTES_LIMIT = 1440;

export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
/** Record id length accepted everywhere (backup importer, cloud mapper, SQL `check (char_length(id) between 1 and 64)`). */
export const ID_MAX = 64;

/** Delay before showing a loading skeleton, to avoid flicker (DESIGN §4). */
export const LOADING_DELAY_MS = 150;
/** Toast auto-hide duration (DESIGN §5). */
export const TOAST_DURATION_MS = 4000;
/** Error toasts with an action stay longer (DESIGN 5: Toast tone error, 8 s). */
export const TOAST_ERROR_DURATION_MS = 8000;
