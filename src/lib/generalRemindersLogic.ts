// Pure planning for the general "check off today" reminder (notifications.ts
// scheduleGeneralReminders). Local notifications can't look at the data when
// they fire, so the plan is made ahead and rebuilt whenever the data changes:
// today's slots only exist while something is still unchecked.

import { shiftYmd } from '@/lib/helpers';

export const GENERAL_ID_PREFIX = 'general:';
export const GENERAL_HORIZON_DAYS = 7;

export interface GeneralSlot {
  id: string;     // general:<ymd>:<HH:MM> — same slot, same id, so a rebuild replaces it
  when: Date;
  pending: number | null; // unchecked items today; null = unknown (future days)
}

// Upcoming slots for `times` over the next GENERAL_HORIZON_DAYS days.
// Today's slots need `pendingToday > 0`; past moments are dropped. Future days
// can't know what will be open, so they carry no count.
export function planGeneralSlots(times: string[], today: string, now: Date, pendingToday: number): GeneralSlot[] {
  const out: GeneralSlot[] = [];
  for (let d = 0; d < GENERAL_HORIZON_DAYS; d++) {
    const ymd = shiftYmd(today, d);
    if (d === 0 && pendingToday <= 0) continue;
    for (const hm of times) {
      const [h, m] = hm.split(':').map(Number);
      const when = new Date(`${ymd}T00:00:00`);
      when.setHours(h, m, 0, 0);
      if (when.getTime() <= now.getTime()) continue;
      out.push({ id: `${GENERAL_ID_PREFIX}${ymd}:${hm}`, when, pending: d === 0 ? pendingToday : null });
    }
  }
  return out;
}
