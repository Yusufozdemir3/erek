// Input length limits for all forms (TextInput maxLength) — practical, so cards
// don't overflow and numbers stay sane.

export const TITLE_MAX_LEN = 60; // habit/task/goal/subtask title

// Reminders per habit/task/goal. A technical cap: each can expand into several
// OS triggers, and iOS silently drops pending ones beyond 64.
export const MAX_REMINDERS_PER_ENTITY = 5;
export const UNIT_MAX_LEN = 20; // unit text (e.g. "cup", "km")
export const NUMBER_MAX_LEN = 9; // target / current value
export const SHORT_NUMBER_MAX_LEN = 4; // daily amount, minutes, ratio
