import type { Settings } from './constants';
import { dayNum, fromDayNum, hm2min, ilParts, ilToUtc, min2hm, weekday } from './dates';

export type DaySlots = { date: string; times: { time: string; iso: string }[] };

/** Free slots from the clinic schedule, minus busy instants. Pure: runs on server or client. */
export type Busy = { starts_at: string; ends_at: string };

export function availableSlots(s: Pick<Settings, 'slot_minutes' | 'horizon_days' | 'notice_hours' | 'weekly' | 'blocked_dates'>, busy: Busy[], now = new Date()): DaySlots[] {
  const ranges = busy.map((b) => [new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime()] as const);
  const blocked = new Set(s.blocked_dates || []);
  const earliest = now.getTime() + (s.notice_hours || 0) * 3600 * 1000;
  const step = Math.max(10, s.slot_minutes || 30);
  const today = ilParts(now).date;
  const out: DaySlots[] = [];
  for (let i = 0; i <= (s.horizon_days || 30); i++) {
    const date = fromDayNum(dayNum(today) + i);
    const cfg = s.weekly?.[String(weekday(date))];
    if (!cfg?.on || blocked.has(date)) continue;
    const times: DaySlots['times'] = [];
    for (let t = hm2min(cfg.from); t + step <= hm2min(cfg.to); t += step) {
      const time = min2hm(t);
      const at = ilToUtc(date, time);
      const start = at.getTime(), end = start + step * 60000;
      if (start < earliest || ranges.some(([bs, be]) => start < be && end > bs)) continue;
      times.push({ time, iso: at.toISOString() });
    }
    if (times.length) out.push({ date, times });
  }
  return out;
}
