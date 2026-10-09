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

/** Delay before showing a loading skeleton, to avoid flicker (DESIGN §4). */
export const LOADING_DELAY_MS = 150;
/** Toast auto-hide duration (DESIGN §5). */
export const TOAST_DURATION_MS = 4000;
