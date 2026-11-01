// Shared-habit rules as pure functions (see src/sync/habitGroups.ts):
//   - A day is DONE for the group only when every member who counts that day
//     has marked it. Our own mark alone is "my part", not "done".
//   - A member counts from the day they joined (the founder from the group's
//     start); on their rest day they don't count at all.
//   - The shared streak follows the habit's normal streak rules over the
//     group's done days; a day where everyone rests neither counts nor breaks it.

import type { GroupLogs, HabitGroup, HabitGroupMember } from '../sync/habitGroups';
import { shiftYmd, toYmd } from './helpers';
import { currentStreakFrom, type StreakHabit } from './streaks';

export type MemberDayState = 'done' | 'waiting' | 'rest';

export interface GroupDayStatus {
  // Members who are part of that day (joined by then), in group order.
  members: { member: HabitGroupMember; state: MemberDayState }[];
  done: number;
  total: number; // members who count that day (not resting)
  allDone: boolean;
}

export function joinedYmd(m: HabitGroupMember): string {
  return toYmd(new Date(m.joinedAt));
}

export function groupStartYmd(group: HabitGroup): string {
  const owner = group.members.find((m) => m.isOwner) ?? group.members[0];
  return owner ? joinedYmd(owner) : toYmd(new Date());
}

// The group that one of OUR habits belongs to, if any.
export function groupOfHabit(groups: HabitGroup[], habitId: string): HabitGroup | null {
  return groups.find((g) => g.members.some((m) => m.isMe && m.habitId === habitId)) ?? null;
}

// `me`: our own state that day, from the local database (fresher than the server's).
export function groupDayStatus(
  group: HabitGroup,
  logs: GroupLogs,
  date: string,
  me: { done: boolean; resting: boolean }
): GroupDayStatus {
  const members: GroupDayStatus['members'] = [];
  let done = 0;
  let total = 0;
  for (const m of group.members) {
    if (!m.isOwner && joinedYmd(m) > date) continue;
    const resting = m.isMe ? me.resting : m.skipDates.includes(date);
    if (resting) {
      members.push({ member: m, state: 'rest' });
      continue;
    }
    const ok = m.isMe ? me.done : logs[m.habitId]?.[date] === true;
    total++;
    if (ok) done++;
    members.push({ member: m, state: ok ? 'done' : 'waiting' });
  }
  return { members, done, total, allDone: total > 0 && done === total };
}

const MAX_DAYS = 3700;

export function sharedStreak(
  group: HabitGroup,
  logs: GroupLogs,
  habit: NonNullable<StreakHabit>,
  myDoneDates: Set<string>,
  today: string
): number {
  const start = groupStartYmd(group);
  const doneDates: string[] = [];
  // Days nobody counts (all resting) behave like unscheduled days.
  const neutral: string[] = [];
  let d = start;
  for (let i = 0; i < MAX_DAYS && d <= today; i++, d = shiftYmd(d, 1)) {
    const s = groupDayStatus(group, logs, d, {
      done: myDoneDates.has(d),
      resting: habit.skip_dates?.includes(d) ?? false,
    });
    if (s.allDone) doneDates.push(d);
    else if (s.total === 0) neutral.push(d);
  }
  const from = habit.start_date && habit.start_date > start ? habit.start_date : start;
  return currentStreakFrom(
    { schedule: habit.schedule, start_date: from, end_date: habit.end_date, skip_dates: neutral },
    doneDates,
    today
  );
}
