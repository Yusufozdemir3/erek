// Form input limits — prevents accidentally entering excessively long
// text/numbers (avoids line overflow in card views and meaningless huge
// numbers). Not a business rule, just a practical safety/aesthetic limit;
// passed to TextInput's `maxLength` prop. Managed from a single place so all
// forms (habit/task/goal) stay consistent.

export const TITLE_MAX_LEN = 60; // habit/task/goal/subtask title

// The maximum number of reminder times an entity (habit/task/goal) can have.
// Unlike the other limits, this one is NOT purely aesthetic but a technical
// ceiling: each reminder expands into multiple OS triggers (as many as the
// selected days in weekly frequency, 8 for "every X days"). Left unbounded, a
// single habit could produce dozens of triggers — iOS caps pending local
// notifications at 64, and anything beyond that gets SILENTLY dropped (the
// user can never tell why their reminder never fires). 5 is far above
// realistic usage but keeps it from blowing up.
export const MAX_REMINDERS_PER_ENTITY = 5;
export const UNIT_MAX_LEN = 20; // unit text (e.g. "cup", "km")
export const NUMBER_MAX_LEN = 9; // large numeric fields (target value, current value)
export const SHORT_NUMBER_MAX_LEN = 4; // small numeric fields (daily amount, minutes, ratio)
