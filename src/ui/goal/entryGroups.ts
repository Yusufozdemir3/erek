// Display-only grouping for a goal's entry history. Entries are never merged in
// the database (each is its own synced row); this only decides how the list is
// SHOWN: taps that land in the same minute by the same person collapse into one
// line, the lines are bucketed per day, and old days fold behind a button.
// Pure — no React, so it is tested directly in the fast 'logic' project.

export interface EntryLike {
  id: string;
  amount: number;
  updated_at: string;
  added_by: string | null;
}

export interface EntryGroup {
  key: string;
  amount: number; // NET of the merged entries (+5 then −1 in a minute → +4)
  count: number; // how many entries were merged
  addedBy: string | null;
  at: string; // ISO time of the newest entry in the group
}

export interface DayGroup {
  day: string; // local "YYYY-MM-DD"
  groups: EntryGroup[];
}

const pad = (n: number) => String(n).padStart(2, '0');

// Local calendar day of an ISO timestamp (the list is read in the user's own time).
export function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function minuteKey(iso: string): string {
  const d = new Date(iso);
  return `${localDay(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// `entries` come newest → oldest. Entries with the same minute AND the same
// contributor merge (not only adjacent ones — two people interleaving in one
// minute still get one line each, so "who added what" survives).
export function groupEntries(entries: EntryLike[]): EntryGroup[] {
  const byKey = new Map<string, EntryGroup>();
  for (const e of entries) {
    const key = `${minuteKey(e.updated_at)}|${e.added_by ?? ''}`;
    const g = byKey.get(key);
    if (g) {
      g.amount += e.amount;
      g.count += 1;
      if (e.updated_at > g.at) g.at = e.updated_at;
    } else {
      byKey.set(key, { key, amount: e.amount, count: 1, addedBy: e.added_by, at: e.updated_at });
    }
  }
  return [...byKey.values()];
}

// Buckets groups by local day, keeping the incoming (newest-first) order.
export function groupByDay(groups: EntryGroup[]): DayGroup[] {
  const out: DayGroup[] = [];
  for (const g of groups) {
    const day = localDay(g.at);
    const last = out[out.length - 1];
    if (last && last.day === day) last.groups.push(g);
    else out.push({ day, groups: [g] });
  }
  return out;
}

export function shiftDay(ymd: string, delta: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Splits into the days to show right away (the last `recentDays`, including
// today) and the older ones behind a button. If NOTHING is recent (a goal that
// went quiet) the newest day still shows, so the list is never empty.
export function splitRecent(
  days: DayGroup[],
  today: string,
  recentDays = 7
): { recent: DayGroup[]; older: DayGroup[]; olderEntryCount: number } {
  const cutoff = shiftDay(today, -(recentDays - 1));
  let recent = days.filter((d) => d.day >= cutoff);
  if (recent.length === 0 && days.length > 0) recent = [days[0]];
  const older = days.filter((d) => !recent.includes(d));
  const olderEntryCount = older.reduce(
    (sum, d) => sum + d.groups.reduce((s, g) => s + g.count, 0),
    0
  );
  return { recent, older, olderEntryCount };
}
