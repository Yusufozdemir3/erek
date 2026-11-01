import type { HabitGroup, HabitGroupMember } from '../../sync/habitGroups';
import { groupDayStatus, groupOfHabit, sharedStreak } from '../habitGroup';

// Local noon, so the joined day is the same in every time zone.
const at = (ymd: string) => new Date(`${ymd}T12:00:00`).toISOString();

function member(over: Partial<HabitGroupMember>): HabitGroupMember {
  return {
    id: 'u',
    habitId: 'h',
    isOwner: false,
    isMe: false,
    joinedAt: at('2026-10-01'),
    displayName: null,
    avatarUrl: null,
    skipDates: [],
    ...over,
  };
}

// Founder Ali started the group on Oct 1; I (Ece) joined Oct 1, Can on Oct 10.
const group: HabitGroup = {
  groupId: 'h-ali',
  members: [
    member({ id: 'ali', habitId: 'h-ali', isOwner: true, displayName: 'Ali' }),
    member({ id: 'ece', habitId: 'h-ece', isMe: true }),
    member({ id: 'can', habitId: 'h-can', joinedAt: at('2026-10-10'), displayName: 'Can' }),
  ],
};

const habit = { schedule: null, start_date: '2026-10-01', end_date: null, skip_dates: [] as string[] };

describe('groupOfHabit', () => {
  it('yalnız BİZİM kopyamızın grubunu bulur', () => {
    expect(groupOfHabit([group], 'h-ece')).toBe(group);
    expect(groupOfHabit([group], 'h-ali')).toBeNull(); // founder's habit isn't ours here
    expect(groupOfHabit([group], 'baska')).toBeNull();
  });
});

describe('groupDayStatus', () => {
  it('benim işaretim tek başına günü bitirmez; herkes işaretleyince biter', () => {
    const logs = { 'h-ali': { '2026-10-12': true }, 'h-can': {} };
    const mine = groupDayStatus(group, logs, '2026-10-12', { done: true, resting: false });
    expect(mine).toMatchObject({ done: 2, total: 3, allDone: false });
    expect(mine.members.find((m) => m.member.id === 'can')?.state).toBe('waiting');

    const all = groupDayStatus(group, { ...logs, 'h-can': { '2026-10-12': true } }, '2026-10-12', {
      done: true,
      resting: false,
    });
    expect(all).toMatchObject({ done: 3, total: 3, allDone: true });
  });

  it('henüz katılmamış üye o gün sayılmaz', () => {
    const s = groupDayStatus(group, { 'h-ali': { '2026-10-05': true } }, '2026-10-05', {
      done: true,
      resting: false,
    });
    expect(s.members.map((m) => m.member.id)).toEqual(['ali', 'ece']);
    expect(s.allDone).toBe(true);
  });

  it('mola günündeki üye sayılmaz ama listede "mola" görünür', () => {
    const g: HabitGroup = {
      ...group,
      members: group.members.map((m) => (m.id === 'can' ? { ...m, skipDates: ['2026-10-12'] } : m)),
    };
    const s = groupDayStatus(g, { 'h-ali': { '2026-10-12': true } }, '2026-10-12', {
      done: true,
      resting: false,
    });
    expect(s).toMatchObject({ done: 2, total: 2, allDone: true });
    expect(s.members.find((m) => m.member.id === 'can')?.state).toBe('rest');
  });

  it('herkes moladaysa gün "bitti" sayılmaz', () => {
    const solo: HabitGroup = { groupId: 'g', members: [member({ id: 'me', isMe: true, isOwner: true })] };
    expect(groupDayStatus(solo, {}, '2026-10-12', { done: false, resting: true }).allDone).toBe(false);
  });
});

describe('sharedStreak', () => {
  const days = (from: number, to: number) =>
    Object.fromEntries(
      Array.from({ length: to - from + 1 }, (_, i) => [`2026-10-${String(from + i).padStart(2, '0')}`, true])
    );

  it('herkesin yaptığı ardışık günleri sayar; birinin kaçırdığı gün seriyi keser', () => {
    const logs = { 'h-ali': days(1, 15), 'h-can': { ...days(10, 15), '2026-10-12': false } };
    const mine = new Set(Object.keys(days(1, 15)));
    // 12th: Can missed -> the run restarts on the 13th: 13, 14, 15.
    expect(sharedStreak(group, logs, habit, mine, '2026-10-15')).toBe(3);
  });

  it('bugün henüz herkes işaretlemediyse seri kırılmaz', () => {
    const logs = { 'h-ali': days(10, 15), 'h-can': days(10, 14) };
    const mine = new Set(Object.keys(days(10, 15)));
    expect(sharedStreak(group, logs, habit, mine, '2026-10-15')).toBe(5);
  });

  it('herkesin molada olduğu gün seriyi ne sayar ne keser', () => {
    const g: HabitGroup = {
      ...group,
      members: group.members.map((m) => (m.isMe ? m : { ...m, skipDates: ['2026-10-13'] })),
    };
    const logs = { 'h-ali': { ...days(10, 15), '2026-10-13': false }, 'h-can': { ...days(10, 15), '2026-10-13': false } };
    const mine = new Set(Object.keys(days(10, 15)).filter((d) => d !== '2026-10-13'));
    const h = { ...habit, skip_dates: ['2026-10-13'] };
    expect(sharedStreak(g, logs, h, mine, '2026-10-15')).toBe(5);
  });
});
