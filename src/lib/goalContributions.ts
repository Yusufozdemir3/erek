// Who added how much to a shared goal — the "contribution split" of a group goal.
// Pure logic. Deliberately NOT a ranking: people come out in a fixed order
// (the viewer first, the rest alphabetically), never by amount, so a shared
// goal reads as "together" rather than a leaderboard.
//
// An entry's author is its added_by; null means the goal's owner (on the
// owner's own screen). A person's total is the net of their entries (a
// correction subtracts) and never goes below zero. The split only exists once
// at least two people actually contributed.

export const OWNER_KEY = '__owner__';

export interface ContributionEntry {
  amount: number;
  added_by: string | null;
}

export interface Contribution {
  key: string; // uid, or OWNER_KEY
  amount: number;
  share: number; // whole percent; all shares add up to exactly 100
}

// Whole percentages that add up to 100 (largest-remainder method).
export function wholePercents(amounts: number[]): number[] {
  const total = amounts.reduce((a, b) => a + b, 0);
  if (total <= 0) return amounts.map(() => 0);
  const raw = amounts.map((a) => (a / total) * 100);
  const floors = raw.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, rest: r - floors[i] })).sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i]++;
    left--;
  }
  return floors;
}

// me: the key that stands for the viewer — OWNER_KEY on the owner's screen,
// the viewer's own uid on a shared goal. nameOf only drives the alphabetical order.
export function contributionShares(
  entries: ContributionEntry[],
  me: string,
  nameOf: (key: string) => string,
  maxPeople = 20
): Contribution[] {
  const totals = new Map<string, number>();
  for (const e of entries) {
    const key = e.added_by ?? OWNER_KEY;
    totals.set(key, (totals.get(key) ?? 0) + e.amount);
  }
  const people = [...totals.entries()].map(([key, amount]) => ({ key, amount: Math.max(0, amount) })).filter((p) => p.amount > 0);
  if (people.length < 2) return [];
  people.sort((a, b) => {
    if (a.key === me) return -1;
    if (b.key === me) return 1;
    return nameOf(a.key).localeCompare(nameOf(b.key));
  });
  const shown = people.slice(0, maxPeople);
  const shares = wholePercents(shown.map((p) => p.amount));
  return shown.map((p, i) => ({ ...p, share: shares[i] }));
}
